const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const LOW_ATTENDANCE_THRESHOLD = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);

function buildDateFilter(alias, query) {
  const clauses = [];
  const params = [];

  if (query.date_from) {
    clauses.push(`${alias}.date >= ?`);
    params.push(query.date_from);
  }

  if (query.date_to) {
    clauses.push(`${alias}.date <= ?`);
    params.push(query.date_to);
  }

  return { sql: clauses.length ? `AND ${clauses.join(' AND ')}` : '', params };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

async function getClassContext(classId) {
  const [rows] = await db.query(
    `
    SELECT c.id, c.name, c.section, c.department_id, d.name AS department_name
    FROM classes c
    JOIN departments d ON c.department_id = d.id
    WHERE c.id = ?
    LIMIT 1
  `,
    [classId]
  );

  return rows[0] || null;
}

async function canAccessClass(user, classId) {
  const context = await getClassContext(classId);
  if (!context) return { exists: false, allowed: false, context: null };

  if (user.role === 'admin') return { exists: true, allowed: true, context };

  if (user.role === 'hod') {
    return {
      exists: true,
      allowed: Boolean(user.department_id) && context.department_id === user.department_id,
      context,
    };
  }

  if (user.role === 'teacher') {
    const [rows] = await db.query(
      'SELECT id FROM subjects WHERE class_id = ? AND teacher_id = ? LIMIT 1',
      [classId, user.id]
    );
    return { exists: true, allowed: rows.length > 0, context };
  }

  return { exists: true, allowed: false, context };
}

async function getStudentAccess(user, studentId) {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.user_id,
      s.roll_number,
      s.parent_phone,
      s.class_id,
      u.name,
      u.email,
      c.name AS class_name,
      c.section,
      c.department_id,
      d.name AS department_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    JOIN classes c ON s.class_id = c.id
    JOIN departments d ON c.department_id = d.id
    WHERE s.id = ?
    LIMIT 1
  `,
    [studentId]
  );

  if (!rows.length) return { exists: false, allowed: false, student: null };

  const student = rows[0];
  if (user.role === 'admin') return { exists: true, allowed: true, student };
  if (user.role === 'student') {
    return { exists: true, allowed: student.user_id === user.id, student };
  }
  if (user.role === 'hod') {
    return {
      exists: true,
      allowed: Boolean(user.department_id) && student.department_id === user.department_id,
      student,
    };
  }
  if (user.role === 'teacher') {
    const [rows] = await db.query(
      'SELECT id FROM subjects WHERE class_id = ? AND teacher_id = ? LIMIT 1',
      [student.class_id, user.id]
    );
    return { exists: true, allowed: rows.length > 0, student };
  }

  return { exists: true, allowed: false, student };
}

// GET /api/reports/class/:classId
router.get('/class/:classId', auth(['admin', 'hod', 'teacher']), async (req, res) => {
  try {
    const access = await canAccessClass(req.user, req.params.classId);
    if (!access.exists) return res.status(404).json({ message: 'Class not found' });
    if (!access.allowed) return res.status(403).json({ message: 'You do not have access to this class report' });

    const dateFilter = buildDateFilter('a', req.query);
    const teacherSubjectFilter = req.user.role === 'teacher' ? 'AND sub.teacher_id = ?' : '';
    const teacherSubjectParams = req.user.role === 'teacher' ? [req.user.id] : [];

    const [subjectSummary] = await db.query(
      `
      SELECT
        sub.id AS subject_id,
        sub.name AS subject,
        u.name AS teacher_name,
        COUNT(a.id) AS total_classes,
        COALESCE(SUM(a.status = 'P'), 0) AS present,
        COALESCE(SUM(a.status = 'A'), 0) AS absent,
        COALESCE(SUM(a.status = 'L'), 0) AS late,
        ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS percentage
      FROM subjects sub
      JOIN users u ON sub.teacher_id = u.id
      LEFT JOIN attendance a ON a.subject_id = sub.id ${dateFilter.sql}
      WHERE sub.class_id = ? ${teacherSubjectFilter}
      GROUP BY sub.id, sub.name, u.name
      ORDER BY sub.name
    `,
      [...dateFilter.params, req.params.classId, ...teacherSubjectParams]
    );

    const [studentSummary] = await db.query(
      `
      SELECT
        s.id AS student_id,
        u.name AS student_name,
        s.roll_number,
        COUNT(a.id) AS total_classes,
        COALESCE(SUM(a.status = 'P'), 0) AS present,
        COALESCE(SUM(a.status = 'A'), 0) AS absent,
        COALESCE(SUM(a.status = 'L'), 0) AS late,
        ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS percentage,
        COUNT(a.id) > 0
          AND ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) < ? AS low_attendance
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN subjects sub ON sub.class_id = s.class_id ${teacherSubjectFilter}
      LEFT JOIN attendance a ON a.student_id = s.id
        AND a.subject_id = sub.id
        ${dateFilter.sql}
      WHERE s.class_id = ?
      GROUP BY s.id, u.name, s.roll_number
      ORDER BY s.roll_number
    `,
      [
        LOW_ATTENDANCE_THRESHOLD,
        ...teacherSubjectParams,
        ...dateFilter.params,
        req.params.classId,
      ]
    );

    const [dailyHeatmap] = await db.query(
      `
      SELECT
        a.date,
        COUNT(*) AS total,
        SUM(a.status = 'P') AS present,
        SUM(a.status = 'A') AS absent,
        SUM(a.status = 'L') AS late,
        ROUND(SUM(a.status = 'P') * 100.0 / COUNT(*), 2) AS percentage
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE sub.class_id = ? ${teacherSubjectFilter} ${dateFilter.sql}
      GROUP BY a.date
      ORDER BY a.date
    `,
      [req.params.classId, ...teacherSubjectParams, ...dateFilter.params]
    );

    const [subjectAbsences] = await db.query(
      `
      SELECT sub.id AS subject_id, sub.name AS subject, SUM(a.status = 'A') AS absent_count
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE sub.class_id = ? ${teacherSubjectFilter} ${dateFilter.sql}
      GROUP BY sub.id, sub.name
      ORDER BY absent_count DESC, sub.name
    `,
      [req.params.classId, ...teacherSubjectParams, ...dateFilter.params]
    );

    res.json({
      class: access.context,
      threshold: LOW_ATTENDANCE_THRESHOLD,
      filters: {
        date_from: req.query.date_from || null,
        date_to: req.query.date_to || null,
      },
      subject_summary: subjectSummary,
      student_summary: studentSummary,
      charts: {
        daily_heatmap: dailyHeatmap,
        subject_absences: subjectAbsences,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/reports/student/:studentId
router.get('/student/:studentId', auth(['admin', 'hod', 'teacher', 'student']), async (req, res) => {
  try {
    const access = await getStudentAccess(req.user, req.params.studentId);
    if (!access.exists) return res.status(404).json({ message: 'Student not found' });
    if (!access.allowed) return res.status(403).json({ message: 'You do not have access to this student report' });

    const dateFilter = buildDateFilter('a', req.query);
    const teacherSubjectFilter = req.user.role === 'teacher' ? 'AND sub.teacher_id = ?' : '';
    const teacherSubjectParams = req.user.role === 'teacher' ? [req.user.id] : [];

    const [subjectSummary] = await db.query(
      `
      SELECT
        sub.id AS subject_id,
        sub.name AS subject,
        COUNT(a.id) AS total_classes,
        COALESCE(SUM(a.status = 'P'), 0) AS present,
        COALESCE(SUM(a.status = 'A'), 0) AS absent,
        COALESCE(SUM(a.status = 'L'), 0) AS late,
        ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS percentage,
        COUNT(a.id) > 0
          AND ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) < ? AS low_attendance
      FROM subjects sub
      LEFT JOIN attendance a ON a.subject_id = sub.id
        AND a.student_id = ?
        ${dateFilter.sql}
      WHERE sub.class_id = ? ${teacherSubjectFilter}
      GROUP BY sub.id, sub.name
      ORDER BY sub.name
    `,
      [
        LOW_ATTENDANCE_THRESHOLD,
        req.params.studentId,
        ...dateFilter.params,
        access.student.class_id,
        ...teacherSubjectParams,
      ]
    );

    const totals = subjectSummary.reduce(
      (acc, item) => ({
        total_classes: acc.total_classes + Number(item.total_classes || 0),
        present: acc.present + Number(item.present || 0),
        absent: acc.absent + Number(item.absent || 0),
        late: acc.late + Number(item.late || 0),
      }),
      { total_classes: 0, present: 0, absent: 0, late: 0 }
    );
    const overallPercentage = totals.total_classes
      ? Number(((totals.present * 100) / totals.total_classes).toFixed(2))
      : null;

    const [history] = await db.query(
      `
      SELECT a.id, a.date, a.period_no, sub.name AS subject, a.status, a.marked_at
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE a.student_id = ? ${teacherSubjectFilter} ${dateFilter.sql}
      ORDER BY a.date DESC, a.period_no DESC
      LIMIT 200
    `,
      [req.params.studentId, ...teacherSubjectParams, ...dateFilter.params]
    );

    const [dailyHeatmap] = await db.query(
      `
      SELECT
        a.date,
        COUNT(*) AS total,
        SUM(a.status = 'P') AS present,
        SUM(a.status = 'A') AS absent,
        SUM(a.status = 'L') AS late,
        ROUND(SUM(a.status = 'P') * 100.0 / COUNT(*), 2) AS percentage
      FROM attendance a
      JOIN subjects sub ON a.subject_id = sub.id
      WHERE a.student_id = ? ${teacherSubjectFilter} ${dateFilter.sql}
      GROUP BY a.date
      ORDER BY a.date
    `,
      [req.params.studentId, ...teacherSubjectParams, ...dateFilter.params]
    );

    res.json({
      student: access.student,
      threshold: LOW_ATTENDANCE_THRESHOLD,
      filters: {
        date_from: req.query.date_from || null,
        date_to: req.query.date_to || null,
      },
      overall: {
        ...totals,
        percentage: overallPercentage,
        low_attendance: overallPercentage !== null && overallPercentage < LOW_ATTENDANCE_THRESHOLD,
      },
      subject_summary: subjectSummary,
      history,
      charts: {
        daily_heatmap: dailyHeatmap,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/reports/export/:classId
router.get('/export/:classId', auth(['admin', 'hod']), async (req, res) => {
  try {
    const access = await canAccessClass(req.user, req.params.classId);
    if (!access.exists) return res.status(404).json({ message: 'Class not found' });
    if (!access.allowed) return res.status(403).json({ message: 'You do not have access to this class export' });

    const dateFilter = buildDateFilter('a', req.query);
    const teacherSubjectFilter = req.user.role === 'teacher' ? 'AND sub.teacher_id = ?' : '';
    const teacherSubjectParams = req.user.role === 'teacher' ? [req.user.id] : [];

    const [rows] = await db.query(
      `
      SELECT
        s.id AS student_id,
        u.name AS student_name,
        s.roll_number,
        sub.name AS subject,
        COUNT(a.id) AS total_classes,
        COALESCE(SUM(a.status = 'P'), 0) AS present,
        COALESCE(SUM(a.status = 'A'), 0) AS absent,
        COALESCE(SUM(a.status = 'L'), 0) AS late,
        ROUND(COALESCE(SUM(a.status = 'P'), 0) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS percentage
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN subjects sub ON sub.class_id = s.class_id
      LEFT JOIN attendance a ON a.student_id = s.id
        AND a.subject_id = sub.id
        ${dateFilter.sql}
      WHERE s.class_id = ? ${teacherSubjectFilter}
      GROUP BY s.id, u.name, s.roll_number, sub.id, sub.name
      ORDER BY s.roll_number, sub.name
    `,
      [...dateFilter.params, req.params.classId, ...teacherSubjectParams]
    );

    const csvRows = [
      [
        'Student ID',
        'Student Name',
        'Roll Number',
        'Class',
        'Section',
        'Department',
        'Subject',
        'Total Classes',
        'Present',
        'Absent',
        'Late',
        'Percentage',
        'Low Attendance',
      ],
      ...rows.map((row) => {
        const percentage = row.percentage === null ? '' : row.percentage;
        const lowAttendance = row.percentage !== null && Number(row.percentage) < LOW_ATTENDANCE_THRESHOLD
          ? 'Yes'
          : 'No';

        return [
          row.student_id,
          row.student_name,
          row.roll_number,
          access.context.name,
          access.context.section,
          access.context.department_name,
          row.subject,
          row.total_classes,
          row.present,
          row.absent,
          row.late,
          percentage,
          lowAttendance,
        ];
      }),
    ];

    const filename = `class-${req.params.classId}-attendance-report.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(toCsv(csvRows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
