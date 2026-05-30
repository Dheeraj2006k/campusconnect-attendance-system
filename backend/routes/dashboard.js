const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const {
  calculateAttendancePrediction,
  normalizeThreshold,
} = require('../utils/attendancePrediction');
const { getActiveTerm } = require('../utils/academicTerms');

async function getScalar(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return Number(Object.values(rows[0] || { value: 0 })[0] || 0);
}

async function getStudentForUser(userId) {
  const [rows] = await db.query(
    `
    SELECT s.id, s.class_id, s.roll_number, s.parent_phone, u.name, u.email, c.attendance_threshold
    FROM students s
    JOIN users u ON s.user_id = u.id
    JOIN classes c ON s.class_id = c.id
    WHERE s.user_id = ?
    LIMIT 1
  `,
    [userId]
  );

  return rows[0] || null;
}

async function getAdminOverview() {
  const [
    totalStudents,
    totalTeachers,
    totalHods,
    totalClasses,
    totalSubjects,
    attendanceMarkedToday,
    todayAbsentRecords,
    smsSentToday,
    smsFailedToday,
  ] = await Promise.all([
    getScalar('SELECT COUNT(*) AS value FROM students'),
    getScalar("SELECT COUNT(*) AS value FROM users WHERE role = 'teacher'"),
    getScalar("SELECT COUNT(*) AS value FROM users WHERE role = 'hod'"),
    getScalar('SELECT COUNT(*) AS value FROM classes'),
    getScalar('SELECT COUNT(*) AS value FROM subjects'),
    getScalar('SELECT COUNT(*) AS value FROM attendance WHERE date = CURDATE()'),
    getScalar("SELECT COUNT(*) AS value FROM attendance WHERE date = CURDATE() AND status = 'A'"),
    getScalar("SELECT COUNT(*) AS value FROM sms_logs WHERE DATE(sent_at) = CURDATE() AND status = 'sent'"),
    getScalar("SELECT COUNT(*) AS value FROM sms_logs WHERE DATE(sent_at) = CURDATE() AND status = 'failed'"),
  ]);

  return {
    scope: 'college',
    totals: {
      students: totalStudents,
      teachers: totalTeachers,
      hods: totalHods,
      classes: totalClasses,
      subjects: totalSubjects,
    },
    today: {
      attendance_records: attendanceMarkedToday,
      absent_records: todayAbsentRecords,
      sms_sent: smsSentToday,
      sms_failed: smsFailedToday,
    },
  };
}

async function getHodOverview(user) {
  if (!user.department_id) {
    return { error: { status: 403, message: 'Department access not configured for this user' } };
  }

  const params = [user.department_id];
  const [
    totalStudents,
    totalTeachers,
    totalClasses,
    totalSubjects,
    attendanceMarkedToday,
    todayAbsentRecords,
    smsSentToday,
    smsFailedToday,
  ] = await Promise.all([
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.department_id = ?
    `,
      params
    ),
    getScalar("SELECT COUNT(*) AS value FROM users WHERE role = 'teacher' AND department_id = ?", params),
    getScalar('SELECT COUNT(*) AS value FROM classes WHERE department_id = ?', params),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM subjects sub
      JOIN classes c ON sub.class_id = c.id
      WHERE c.department_id = ?
    `,
      params
    ),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      JOIN classes c ON sub.class_id = c.id
      WHERE a.date = CURDATE() AND c.department_id = ?
    `,
      params
    ),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      JOIN classes c ON sub.class_id = c.id
      WHERE a.date = CURDATE() AND a.status = 'A' AND c.department_id = ?
    `,
      params
    ),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM sms_logs sl
      JOIN students s ON sl.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE DATE(sl.sent_at) = CURDATE() AND sl.status = 'sent' AND c.department_id = ?
    `,
      params
    ),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM sms_logs sl
      JOIN students s ON sl.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE DATE(sl.sent_at) = CURDATE() AND sl.status = 'failed' AND c.department_id = ?
    `,
      params
    ),
  ]);

  return {
    scope: 'department',
    department_id: user.department_id,
    totals: {
      students: totalStudents,
      teachers: totalTeachers,
      classes: totalClasses,
      subjects: totalSubjects,
    },
    today: {
      attendance_records: attendanceMarkedToday,
      absent_records: todayAbsentRecords,
      sms_sent: smsSentToday,
      sms_failed: smsFailedToday,
    },
  };
}

async function getTeacherOverview(user) {
  const [
    assignedSubjects,
    assignedClasses,
    studentsTaught,
    attendanceMarkedToday,
    todayAbsentRecords,
  ] = await Promise.all([
    getScalar('SELECT COUNT(*) AS value FROM subjects WHERE teacher_id = ?', [user.id]),
    getScalar('SELECT COUNT(DISTINCT class_id) AS value FROM subjects WHERE teacher_id = ?', [user.id]),
    getScalar(
      `
      SELECT COUNT(DISTINCT s.id) AS value
      FROM students s
      JOIN subjects sub ON s.class_id = sub.class_id
      WHERE sub.teacher_id = ?
    `,
      [user.id]
    ),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE a.date = CURDATE() AND sub.teacher_id = ?
    `,
      [user.id]
    ),
    getScalar(
      `
      SELECT COUNT(*) AS value
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE a.date = CURDATE() AND a.status = 'A' AND sub.teacher_id = ?
    `,
      [user.id]
    ),
  ]);

  return {
    scope: 'teacher',
    teacher_id: user.id,
    totals: {
      assigned_subjects: assignedSubjects,
      assigned_classes: assignedClasses,
      students_taught: studentsTaught,
    },
    today: {
      attendance_records: attendanceMarkedToday,
      absent_records: todayAbsentRecords,
    },
  };
}

async function getStudentOverview(user) {
  const student = await getStudentForUser(user.id);
  if (!student) {
    return { error: { status: 404, message: 'Student profile not found' } };
  }
  const threshold = normalizeThreshold(student.attendance_threshold);
  const activeTerm = await getActiveTerm();
  const termFilter = activeTerm ? 'AND term_id = ?' : '';
  const termParams = activeTerm ? [activeTerm.id] : [];

  const [summary] = await db.query(
    `
    SELECT
      COUNT(*) AS total_classes,
      COALESCE(SUM(status = 'P'), 0) AS present,
      COALESCE(SUM(status = 'A'), 0) AS absent,
      COALESCE(SUM(status = 'L'), 0) AS late,
      ROUND(COALESCE(SUM(status = 'P'), 0) * 100.0 / NULLIF(COUNT(*), 0), 2) AS percentage
    FROM attendance
    WHERE student_id = ? ${termFilter}
  `,
    [student.id, ...termParams]
  );

  const [lowSubjects] = await db.query(
    `
    SELECT
      sub.id AS subject_id,
      sub.name AS subject,
      COUNT(a.id) AS total_classes,
      COALESCE(SUM(a.status = 'P'), 0) AS present,
      COALESCE(SUM(a.status = 'A'), 0) AS absent,
      COALESCE(SUM(a.status = 'L'), 0) AS late,
      ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS percentage
    FROM subjects sub
    LEFT JOIN attendance a ON a.subject_id = sub.id AND a.student_id = ? ${activeTerm ? 'AND a.term_id = ?' : ''}
    WHERE sub.class_id = ?
    GROUP BY sub.id, sub.name
    HAVING total_classes > 0 AND percentage < ?
    ORDER BY percentage ASC
  `,
    [student.id, ...termParams, student.class_id, threshold]
  );

  const row = summary[0] || {};
  const overallPrediction = calculateAttendancePrediction({
    present: row.present,
    total: row.total_classes,
    threshold,
  });
  const lowSubjectsWithPrediction = lowSubjects.map((subject) => ({
    ...subject,
    ...calculateAttendancePrediction({
      present: subject.present,
      total: subject.total_classes,
      threshold,
    }),
  }));

  return {
    scope: 'student',
    student,
    threshold,
    term: activeTerm,
    overall: {
      total_classes: Number(row.total_classes || 0),
      present: Number(row.present || 0),
      absent: Number(row.absent || 0),
      late: Number(row.late || 0),
      percentage: row.percentage === null ? null : Number(row.percentage || 0),
      ...overallPrediction,
    },
    low_subjects: lowSubjectsWithPrediction,
  };
}

async function getRecentActivity(user, limit) {
  const params = [];
  let scopeJoin = '';
  let scopeWhere = '';

  if (user.role === 'hod') {
    if (!user.department_id) return { error: { status: 403, message: 'Department access not configured for this user' } };
    scopeWhere = 'AND c.department_id = ?';
    params.push(user.department_id);
  }

  if (user.role === 'teacher') {
    scopeWhere = 'AND sub.teacher_id = ?';
    params.push(user.id);
  }

  if (user.role === 'student') {
    const student = await getStudentForUser(user.id);
    if (!student) return { error: { status: 404, message: 'Student profile not found' } };
    scopeJoin = 'JOIN attendance own_a ON own_a.subject_id = sub.id AND own_a.date = a.date AND own_a.period_no = a.period_no';
    scopeWhere = 'AND own_a.student_id = ?';
    params.push(student.id);
  }

  const [rows] = await db.query(
    `
    SELECT
      sub.id AS subject_id,
      sub.name AS subject_name,
      c.id AS class_id,
      c.name AS class_name,
      c.section,
      c.department_id,
      d.name AS department_name,
      u.id AS teacher_id,
      u.name AS teacher_name,
      a.date,
      a.period_no,
      COUNT(*) AS total,
      SUM(a.status = 'P') AS present_count,
      SUM(a.status = 'A') AS absent_count,
      SUM(a.status = 'L') AS late_count,
      MAX(a.marked_at) AS submitted_at
    FROM attendance a
    JOIN subjects sub ON a.subject_id = sub.id
    JOIN classes c ON sub.class_id = c.id
    JOIN departments d ON c.department_id = d.id
    JOIN users u ON sub.teacher_id = u.id
    ${scopeJoin}
    WHERE 1 = 1 ${scopeWhere}
    GROUP BY sub.id, sub.name, c.id, c.name, c.section, c.department_id, d.name,
             u.id, u.name, a.date, a.period_no
    ORDER BY submitted_at DESC
    LIMIT ?
  `,
    [...params, limit]
  );

  return { data: rows };
}

// GET /api/dashboard/overview
router.get('/overview', auth(['admin', 'hod', 'teacher', 'student']), async (req, res) => {
  try {
    let overview;
    if (req.user.role === 'admin') overview = await getAdminOverview();
    if (req.user.role === 'hod') overview = await getHodOverview(req.user);
    if (req.user.role === 'teacher') overview = await getTeacherOverview(req.user);
    if (req.user.role === 'student') overview = await getStudentOverview(req.user);

    if (overview?.error) {
      return res.status(overview.error.status).json({ message: overview.error.message });
    }

    res.json(overview);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/dashboard/activity?limit=20
router.get('/activity', auth(['admin', 'hod', 'teacher', 'student']), async (req, res) => {
  const requestedLimit = Number(req.query.limit || 20);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : 20;

  try {
    const result = await getRecentActivity(req.user, limit);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    res.json({
      limit,
      data: result.data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
