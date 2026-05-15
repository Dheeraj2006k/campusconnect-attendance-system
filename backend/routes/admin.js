const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const auth = require('../middleware/auth');

function handleDbError(res, err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate record already exists' });
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(409).json({ message: 'Record is linked to other data' });
  }

  console.error(err);
  return res.status(500).json({ message: 'Server error' });
}

function requireDepartment(req, res) {
  if (!req.user.department_id) {
    res.status(403).json({ message: 'Department access not configured for this user' });
    return false;
  }

  return true;
}

// Departments

// GET /api/admin/departments
router.get('/departments', auth(['admin', 'hod']), async (req, res) => {
  try {
    const query = req.user.role === 'hod'
      ? ['SELECT * FROM departments WHERE id = ?', [req.user.department_id]]
      : ['SELECT * FROM departments', []];

    const [rows] = await db.query(query[0], query[1]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/departments
router.post('/departments', auth(['admin']), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Department name required' });

  try {
    const [result] = await db.query('INSERT INTO departments (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Department already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/departments/:id
router.put('/departments/:id', auth(['admin']), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Department name required' });

  try {
    const [result] = await db.query(
      'UPDATE departments SET name = ? WHERE id = ?',
      [name, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }

    res.json({ id: Number(req.params.id), name });
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE /api/admin/departments/:id
router.delete('/departments/:id', auth(['admin']), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM departments WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }

    res.json({ message: 'Department deleted' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// Classes

// GET /api/admin/classes
router.get('/classes', auth(['admin', 'hod', 'teacher']), async (req, res) => {
  try {
    let where = '';
    const params = [];

    if (req.user.role === 'hod') {
      if (!requireDepartment(req, res)) return;
      where = 'WHERE c.department_id = ?';
      params.push(req.user.department_id);
    }

    if (req.user.role === 'teacher') {
      where = 'WHERE EXISTS (SELECT 1 FROM subjects sub WHERE sub.class_id = c.id AND sub.teacher_id = ?)';
      params.push(req.user.id);
    }

    const [rows] = await db.query(`
      SELECT c.id, c.name, c.section, c.department_id, d.name AS department
      FROM classes c
      JOIN departments d ON c.department_id = d.id
      ${where}
      ORDER BY c.name, c.section
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/classes
router.post('/classes', auth(['admin']), async (req, res) => {
  const { name, section, department_id } = req.body;
  if (!name || !section || !department_id) {
    return res.status(400).json({ message: 'name, section, department_id required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO classes (name, section, department_id) VALUES (?, ?, ?)',
      [name, section, department_id]
    );
    res.status(201).json({ id: result.insertId, name, section, department_id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/classes/:id
router.put('/classes/:id', auth(['admin']), async (req, res) => {
  const { name, section, department_id } = req.body;
  if (!name || !section || !department_id) {
    return res.status(400).json({ message: 'name, section, department_id required' });
  }

  try {
    const [result] = await db.query(
      'UPDATE classes SET name = ?, section = ?, department_id = ? WHERE id = ?',
      [name, section, department_id, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json({ id: Number(req.params.id), name, section, department_id });
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE /api/admin/classes/:id
router.delete('/classes/:id', auth(['admin']), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM classes WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json({ message: 'Class deleted' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// Teachers

// GET /api/admin/teachers
router.get('/teachers', auth(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.name, u.email, u.department_id, d.name AS department
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'teacher'
      ORDER BY u.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/teachers
router.post('/teachers', auth(['admin']), async (req, res) => {
  const { name, email, password, department_id } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, password required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role, department_id) VALUES (?, ?, ?, 'teacher', ?)",
      [name, email, hash, department_id || null]
    );
    res.status(201).json({ id: result.insertId, name, email, role: 'teacher' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/teachers/:id
router.put('/teachers/:id', auth(['admin']), async (req, res) => {
  const { name, email, password, department_id } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'name and email required' });
  }

  try {
    const values = [name, email, department_id || null];
    let sql = 'UPDATE users SET name = ?, email = ?, department_id = ?';

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sql += ', password = ?';
      values.push(hash);
    }

    sql += " WHERE id = ? AND role = 'teacher'";
    values.push(req.params.id);

    const [result] = await db.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json({ id: Number(req.params.id), name, email, role: 'teacher', department_id: department_id || null });
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE /api/admin/teachers/:id
router.delete('/teachers/:id', auth(['admin']), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ? AND role = ?', [req.params.id, 'teacher']);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json({ message: 'Teacher deleted' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// HODs

// GET /api/admin/hods
router.get('/hods', auth(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.name, u.email, u.department_id, d.name AS department
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'hod'
    `);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

// POST /api/admin/hods
router.post('/hods', auth(['admin']), async (req, res) => {
  const { name, email, password, department_id } = req.body;
  if (!name || !email || !password || !department_id) {
    return res.status(400).json({ message: 'name, email, password, department_id required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role, department_id) VALUES (?, ?, ?, 'hod', ?)",
      [name, email, hash, department_id]
    );
    res.status(201).json({ id: result.insertId, name, email, role: 'hod', department_id });
  } catch (err) {
    handleDbError(res, err);
  }
});

// PUT /api/admin/hods/:id
router.put('/hods/:id', auth(['admin']), async (req, res) => {
  const { name, email, password, department_id } = req.body;
  if (!name || !email || !department_id) {
    return res.status(400).json({ message: 'name, email, department_id required' });
  }

  try {
    const values = [name, email, department_id];
    let sql = 'UPDATE users SET name = ?, email = ?, department_id = ?';

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sql += ', password = ?';
      values.push(hash);
    }

    sql += " WHERE id = ? AND role = 'hod'";
    values.push(req.params.id);

    const [result] = await db.query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'HOD not found' });
    }

    res.json({ id: Number(req.params.id), name, email, role: 'hod', department_id });
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE /api/admin/hods/:id
router.delete('/hods/:id', auth(['admin']), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ? AND role = ?', [req.params.id, 'hod']);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'HOD not found' });
    }

    res.json({ message: 'HOD deleted' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// Students

// GET /api/admin/students
router.get('/students', auth(['admin', 'hod', 'teacher']), async (req, res) => {
  try {
    const whereParts = [];
    const params = [];
    const { class_id } = req.query;

    if (req.user.role === 'hod') {
      if (!requireDepartment(req, res)) return;
      whereParts.push('c.department_id = ?');
      params.push(req.user.department_id);
    }

    if (req.user.role === 'teacher') {
      whereParts.push('EXISTS (SELECT 1 FROM subjects sub WHERE sub.class_id = c.id AND sub.teacher_id = ?)');
      params.push(req.user.id);
    }

    if (class_id) {
      whereParts.push('s.class_id = ?');
      params.push(class_id);
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await db.query(`
      SELECT s.id, u.name, u.email, s.roll_number, s.parent_phone, s.parent_email, s.class_id,
             c.name AS class_name, c.section, c.department_id
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      ${where}
      ORDER BY c.name, c.section, s.roll_number
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/students
router.post('/students', auth(['admin']), async (req, res) => {
  const { name, email, password, roll_number, parent_phone, parent_email, class_id } = req.body;
  if (!name || !email || !password || !roll_number || !parent_phone || !parent_email || !class_id) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const hash = await bcrypt.hash(password, 10);

    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'student')",
      [name, email, hash]
    );

    const [studentResult] = await conn.query(
      'INSERT INTO students (user_id, roll_number, parent_phone, parent_email, class_id) VALUES (?, ?, ?, ?, ?)',
      [userResult.insertId, roll_number, parent_phone, parent_email, class_id]
    );

    await conn.commit();
    res.status(201).json({ id: studentResult.insertId, name, roll_number });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email or roll number already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/admin/students/:id
router.put('/students/:id', auth(['admin']), async (req, res) => {
  const { name, email, password, roll_number, parent_phone, parent_email, class_id } = req.body;
  if (!name || !email || !roll_number || !parent_phone || !parent_email || !class_id) {
    return res.status(400).json({ message: 'name, email, roll_number, parent_phone, parent_email, class_id required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [students] = await conn.query(
      'SELECT user_id FROM students WHERE id = ?',
      [req.params.id]
    );

    if (students.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Student not found' });
    }

    const userId = students[0].user_id;
    const values = [name, email];
    let sql = 'UPDATE users SET name = ?, email = ?';

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sql += ', password = ?';
      values.push(hash);
    }

    sql += ' WHERE id = ?';
    values.push(userId);

    await conn.query(sql, values);
    await conn.query(
      'UPDATE students SET roll_number = ?, parent_phone = ?, parent_email = ?, class_id = ? WHERE id = ?',
      [roll_number, parent_phone, parent_email, class_id, req.params.id]
    );

    await conn.commit();
    res.json({ id: Number(req.params.id), name, email, roll_number, parent_phone, parent_email, class_id });
  } catch (err) {
    await conn.rollback();
    handleDbError(res, err);
  } finally {
    conn.release();
  }
});

// DELETE /api/admin/students/:id
router.delete('/students/:id', auth(['admin']), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [students] = await conn.query('SELECT user_id FROM students WHERE id = ?', [req.params.id]);

    if (students.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Student not found' });
    }

    await conn.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    await conn.query("DELETE FROM users WHERE id = ? AND role = 'student'", [students[0].user_id]);

    await conn.commit();
    res.json({ message: 'Student deleted' });
  } catch (err) {
    await conn.rollback();
    handleDbError(res, err);
  } finally {
    conn.release();
  }
});

// Subjects

// GET /api/admin/subjects
router.get('/subjects', auth(['admin', 'hod', 'teacher']), async (req, res) => {
  try {
    let where = '';
    const params = [];

    if (req.user.role === 'hod') {
      if (!requireDepartment(req, res)) return;
      where = 'WHERE c.department_id = ?';
      params.push(req.user.department_id);
    }

    if (req.user.role === 'teacher') {
      where = 'WHERE sub.teacher_id = ?';
      params.push(req.user.id);
    }

    const [rows] = await db.query(`
      SELECT sub.id, sub.name, sub.class_id, sub.teacher_id,
             c.name AS class_name, c.section, c.department_id,
             u.name AS teacher_name
      FROM subjects sub
      JOIN classes c ON sub.class_id = c.id
      JOIN users u ON sub.teacher_id = u.id
      ${where}
      ORDER BY c.name, c.section, sub.name
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/subjects
router.post('/subjects', auth(['admin']), async (req, res) => {
  const { name, class_id, teacher_id } = req.body;
  if (!name || !class_id || !teacher_id) {
    return res.status(400).json({ message: 'name, class_id, teacher_id required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO subjects (name, class_id, teacher_id) VALUES (?, ?, ?)',
      [name, class_id, teacher_id]
    );
    res.status(201).json({ id: result.insertId, name, class_id, teacher_id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/subjects/:id
router.put('/subjects/:id', auth(['admin']), async (req, res) => {
  const { name, class_id, teacher_id } = req.body;
  if (!name || !class_id || !teacher_id) {
    return res.status(400).json({ message: 'name, class_id, teacher_id required' });
  }

  try {
    const [result] = await db.query(
      'UPDATE subjects SET name = ?, class_id = ?, teacher_id = ? WHERE id = ?',
      [name, class_id, teacher_id, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json({ id: Number(req.params.id), name, class_id, teacher_id });
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE /api/admin/subjects/:id
router.delete('/subjects/:id', auth(['admin']), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM subjects WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json({ message: 'Subject deleted' });
  } catch (err) {
    handleDbError(res, err);
  }
});

module.exports = router;
