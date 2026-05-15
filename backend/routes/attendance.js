const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { sendAbsentSMS, sendAttendanceRiskAlerts } = require('../utils/smsService');

async function canAccessSubject(user, subjectId) {
  if (user.role === 'admin') return true;

  const params = [subjectId];
  let rule = '';

  if (user.role === 'teacher') {
    rule = 'AND sub.teacher_id = ?';
    params.push(user.id);
  } else if (user.role === 'hod') {
    if (!user.department_id) return false;
    rule = 'AND c.department_id = ?';
    params.push(user.department_id);
  } else {
    return false;
  }

  const [rows] = await db.query(
    `
    SELECT sub.id
    FROM subjects sub
    JOIN classes c ON sub.class_id = c.id
    WHERE sub.id = ? ${rule}
    LIMIT 1
  `,
    params
  );

  return rows.length > 0;
}

async function getSubjectContext(subjectId) {
  const [rows] = await db.query(
    `
    SELECT
      sub.id AS subject_id,
      sub.name AS subject_name,
      sub.class_id,
      sub.teacher_id,
      c.name AS class_name,
      c.section,
      c.department_id,
      d.name AS department_name,
      u.name AS teacher_name
    FROM subjects sub
    JOIN classes c ON sub.class_id = c.id
    JOIN departments d ON c.department_id = d.id
    JOIN users u ON sub.teacher_id = u.id
    WHERE sub.id = ?
    LIMIT 1
  `,
    [subjectId]
  );

  return rows[0] || null;
}

async function getStudentAccess(user, studentId) {
  const [rows] = await db.query(
    `
    SELECT s.id, s.user_id, c.department_id
    FROM students s
    JOIN classes c ON s.class_id = c.id
    WHERE s.id = ?
    LIMIT 1
  `,
    [studentId]
  );

  if (rows.length === 0) return { exists: false, allowed: false };

  const student = rows[0];
  if (user.role === 'admin') return { exists: true, allowed: true };
  if (user.role === 'student') return { exists: true, allowed: student.user_id === user.id };
  if (user.role === 'hod') {
    return { exists: true, allowed: Boolean(user.department_id) && student.department_id === user.department_id };
  }

  if (user.role === 'teacher') {
    const [teacherRows] = await db.query(
      `
      SELECT sub.id
      FROM subjects sub
      JOIN students s ON s.class_id = sub.class_id
      WHERE s.id = ? AND sub.teacher_id = ?
      LIMIT 1
    `,
      [studentId, user.id]
    );

    return { exists: true, allowed: teacherRows.length > 0 };
  }

  return { exists: true, allowed: false };
}

function buildAttendanceEvent(context, date, periodNo, records, extra = {}) {
  const absentCount = records.filter((record) => record.status === 'A').length;
  const lateCount = records.filter((record) => record.status === 'L').length;
  const presentCount = records.filter((record) => record.status === 'P').length;

  return {
    subject_id: context.subject_id,
    subject_name: context.subject_name,
    class_id: context.class_id,
    class_name: context.class_name,
    section: context.section,
    department_id: context.department_id,
    department_name: context.department_name,
    teacher_id: context.teacher_id,
    teacher_name: context.teacher_name,
    date,
    period_no: Number(periodNo),
    total: records.length,
    present_count: presentCount,
    absent_count: absentCount,
    late_count: lateCount,
    submitted_at: new Date().toISOString(),
    ...extra,
  };
}

// Mark attendance
// POST /api/attendance/mark
// Body: { subject_id, date, period_no, records: [{ student_id, status }] }
router.post('/mark', auth(['teacher']), async (req, res) => {
  const { subject_id, date, period_no, records } = req.body;

  if (!subject_id || !date || !period_no || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'subject_id, date, period_no, records[] required' });
  }

  if (!Number.isInteger(Number(period_no)) || Number(period_no) < 1 || Number(period_no) > 8) {
    return res.status(400).json({ message: 'period_no must be between 1 and 8' });
  }

  const studentIds = records.map((record) => Number(record.student_id));
  if (studentIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ message: 'Each record must include a valid student_id' });
  }

  const uniqueStudentIds = [...new Set(studentIds)];
  if (uniqueStudentIds.length !== studentIds.length) {
    return res.status(400).json({ message: 'Duplicate student_id values found in submitted records' });
  }

  if (records.some((record) => !['P', 'A', 'L'].includes(record.status))) {
    return res.status(400).json({ message: 'Each status must be P, A, or L' });
  }

  const conn = await db.getConnection();
  let transactionStarted = false;
  try {
    const ownsSubject = await canAccessSubject(req.user, subject_id);
    if (!ownsSubject) {
      return res.status(403).json({ message: 'You can mark attendance only for your assigned subjects' });
    }

    const context = await getSubjectContext(subject_id);
    if (!context) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const [validStudents] = await conn.query(
      'SELECT id FROM students WHERE class_id = ? AND id IN (?)',
      [context.class_id, uniqueStudentIds]
    );
    const validStudentIds = new Set(validStudents.map((student) => Number(student.id)));
    const invalidStudentIds = uniqueStudentIds.filter((id) => !validStudentIds.has(id));

    if (invalidStudentIds.length > 0) {
      return res.status(400).json({
        message: 'Some students do not belong to the selected subject class',
        invalid_student_ids: invalidStudentIds,
      });
    }

    const [duplicates] = await conn.query(
      `
      SELECT student_id
      FROM attendance
      WHERE subject_id = ? AND date = ? AND period_no = ? AND student_id IN (?)
    `,
      [subject_id, date, period_no, uniqueStudentIds]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({
        message: 'Attendance already exists for this subject, date, period, and one or more students',
        duplicate_student_ids: duplicates.map((row) => row.student_id),
      });
    }

    await conn.beginTransaction();
    transactionStarted = true;

    const values = records.map((record) => [
      record.student_id,
      subject_id,
      date,
      period_no,
      record.status,
    ]);

    await conn.query(
      `INSERT INTO attendance (student_id, subject_id, date, period_no, status)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    transactionStarted = false;

    const io = req.app.get('io');

    const absentIds = records
      .filter((record) => record.status === 'A')
      .map((record) => record.student_id);

    const eventPayload = buildAttendanceEvent(context, date, period_no, records, {
      sms_queued: absentIds.length,
      risk_alerts_queued: records.length,
    });
    io.emit('attendance_marked', eventPayload);
    io.emit('attendanceMarked', eventPayload);

    if (absentIds.length > 0) {
      sendAbsentSMS(absentIds, date).catch(console.error);
    }

    sendAttendanceRiskAlerts(studentIds, subject_id).catch(console.error);

    res.json({
      message: 'Attendance marked',
      total: records.length,
      present_count: eventPayload.present_count,
      absent_count: eventPayload.absent_count,
      late_count: eventPayload.late_count,
      sms_queued: absentIds.length,
      risk_alerts_queued: records.length,
    });
  } catch (err) {
    if (transactionStarted) await conn.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Attendance already exists for this session' });
    }
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
});

// Get attendance for a subject/date
// GET /api/attendance?subject_id=2&date=2026-05-14&period_no=1
router.get('/', auth(['teacher', 'admin', 'hod']), async (req, res) => {
  const { subject_id, date, period_no } = req.query;
  if (!subject_id || !date) {
    return res.status(400).json({ message: 'subject_id and date required' });
  }

  try {
    const allowed = await canAccessSubject(req.user, subject_id);
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have access to this subject attendance' });
    }

    const [rows] = await db.query(
      `
      SELECT
        a.id,
        a.student_id,
        u.name,
        s.roll_number,
        a.status,
        a.period_no,
        a.marked_at,
        TIMESTAMPDIFF(MINUTE, a.marked_at, NOW()) <= 30 AS teacher_editable
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE a.subject_id = ? AND a.date = ?
      ${period_no ? 'AND a.period_no = ?' : ''}
      ORDER BY s.roll_number
    `,
      period_no ? [subject_id, date, period_no] : [subject_id, date]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Student attendance summary
// GET /api/attendance/summary/:student_id
router.get('/summary/:student_id', auth(['teacher', 'admin', 'hod', 'student']), async (req, res) => {
  try {
    const access = await getStudentAccess(req.user, req.params.student_id);
    if (!access.exists) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!access.allowed) {
      return res.status(403).json({ message: 'You do not have access to this student attendance' });
    }

    const teacherFilter = req.user.role === 'teacher' ? 'AND sub.teacher_id = ?' : '';
    const params = req.user.role === 'teacher'
      ? [req.params.student_id, req.user.id]
      : [req.params.student_id];

    const [rows] = await db.query(
      `
      SELECT
        sub.name AS subject,
        COUNT(*) AS total_classes,
        SUM(a.status = 'P') AS present,
        SUM(a.status = 'A') AS absent,
        ROUND(SUM(a.status = 'P') * 100.0 / COUNT(*), 2) AS percentage
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE a.student_id = ?
      ${teacherFilter}
      GROUP BY a.subject_id, sub.name
    `,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a single record
// PATCH /api/attendance/:id
// Body: { status: 'P' | 'A' | 'L' }
router.patch('/:id', auth(['teacher', 'admin']), async (req, res) => {
  const { status } = req.body;
  if (!['P', 'A', 'L'].includes(status)) {
    return res.status(400).json({ message: 'status must be P, A, or L' });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        a.id,
        a.student_id,
        a.subject_id,
        a.date,
        a.period_no,
        a.status AS previous_status,
        a.marked_at,
        TIMESTAMPDIFF(MINUTE, a.marked_at, NOW()) AS minutes_since_marked,
        sub.teacher_id
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE a.id = ?
      LIMIT 1
    `,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const record = rows[0];

    if (req.user.role === 'teacher') {
      if (record.teacher_id !== req.user.id) {
        return res.status(403).json({ message: 'You can edit only your assigned subject attendance' });
      }

      if (record.minutes_since_marked > 30) {
        return res.status(403).json({ message: 'Teacher edit window expired after 30 minutes' });
      }
    }

    await db.query('UPDATE attendance SET status = ? WHERE id = ?', [status, req.params.id]);

    const context = await getSubjectContext(record.subject_id);
    const updatedRecord = [{ student_id: record.student_id, status }];
    const eventPayload = buildAttendanceEvent(context, record.date, record.period_no, updatedRecord, {
      attendance_id: record.id,
      previous_status: record.previous_status,
      edited_by: req.user.id,
      edited_by_role: req.user.role,
      sms_queued: status === 'A' && record.previous_status !== 'A' ? 1 : 0,
      risk_alerts_queued: 1,
    });

    const io = req.app.get('io');
    io.emit('attendance_updated', eventPayload);
    io.emit('attendanceUpdated', eventPayload);

    if (status === 'A' && record.previous_status !== 'A') {
      sendAbsentSMS([record.student_id], record.date).catch(console.error);
    }

    sendAttendanceRiskAlerts([record.student_id], record.subject_id).catch(console.error);

    res.json({
      message: 'Record updated',
      id: record.id,
      previous_status: record.previous_status,
      status,
      sms_queued: eventPayload.sms_queued,
      risk_alerts_queued: 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
