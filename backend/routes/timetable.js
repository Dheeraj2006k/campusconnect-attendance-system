const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

function handleDbError(res, err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate timetable slot already exists' });
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(409).json({ message: 'Timetable slot is linked to other data' });
  }

  console.error(err);
  return res.status(500).json({ message: 'Server error' });
}

async function canAccessClass(user, classId) {
  if (user.role === 'admin') return true;

  const params = [classId];
  let rule = '';

  if (user.role === 'hod') {
    if (!user.department_id) return false;
    rule = 'AND c.department_id = ?';
    params.push(user.department_id);
  } else if (user.role === 'teacher') {
    rule = 'AND EXISTS (SELECT 1 FROM subjects sub WHERE sub.class_id = c.id AND sub.teacher_id = ?)';
    params.push(user.id);
  } else if (user.role === 'student') {
    rule = 'AND EXISTS (SELECT 1 FROM students s WHERE s.class_id = c.id AND s.user_id = ?)';
    params.push(user.id);
  } else {
    return false;
  }

  const [rows] = await db.query(
    `
    SELECT c.id
    FROM classes c
    WHERE c.id = ? ${rule}
    LIMIT 1
  `,
    params
  );

  return rows.length > 0;
}

// GET /api/timetable?class_id=1
router.get('/', auth(['teacher', 'admin', 'hod', 'student']), async (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ message: 'class_id required' });

  try {
    const allowed = await canAccessClass(req.user, class_id);
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have access to this class timetable' });
    }

    const [rows] = await db.query(
      `
      SELECT
        t.id, t.class_id, t.subject_id, t.day_of_week, t.period_no,
        sub.name AS subject,
        u.name AS teacher
      FROM timetable t
      JOIN subjects sub ON t.subject_id = sub.id
      JOIN users u ON sub.teacher_id = u.id
      WHERE t.class_id = ?
      ORDER BY FIELD(t.day_of_week,
        'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'
      ), t.period_no
    `,
      [class_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/timetable
router.post('/', auth(['admin']), async (req, res) => {
  const { class_id, subject_id, period_no, day_of_week } = req.body;
  if (!class_id || !subject_id || !period_no || !day_of_week) {
    return res.status(400).json({ message: 'All fields required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO timetable (class_id, subject_id, period_no, day_of_week) VALUES (?, ?, ?, ?)',
      [class_id, subject_id, period_no, day_of_week]
    );
    res.status(201).json({ id: result.insertId, class_id, subject_id, period_no, day_of_week });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/timetable/:id
router.put('/:id', auth(['admin']), async (req, res) => {
  const { class_id, subject_id, period_no, day_of_week } = req.body;
  if (!class_id || !subject_id || !period_no || !day_of_week) {
    return res.status(400).json({ message: 'All fields required' });
  }

  try {
    const [result] = await db.query(
      'UPDATE timetable SET class_id = ?, subject_id = ?, period_no = ?, day_of_week = ? WHERE id = ?',
      [class_id, subject_id, period_no, day_of_week, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    res.json({ id: Number(req.params.id), class_id, subject_id, period_no, day_of_week });
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE /api/timetable/:id
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM timetable WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    res.json({ message: 'Slot removed' });
  } catch (err) {
    handleDbError(res, err);
  }
});

module.exports = router;
