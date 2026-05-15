const bcrypt = require('bcryptjs');
require('dotenv').config();
const db = require('../config/db');

const DEMO_PASSWORD = 'Demo@123';

async function upsertDepartment(name) {
  await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name]);
  const [rows] = await db.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [name]);
  return rows[0].id;
}

async function upsertUser({ name, email, role, departmentId = null }) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.query(
    `
    INSERT INTO users (name, email, password, role, department_id)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      password = VALUES(password),
      role = VALUES(role),
      department_id = VALUES(department_id)
  `,
    [name, email, hash, role, departmentId]
  );

  const [rows] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0].id;
}

async function getOrCreateClass(name, section, departmentId) {
  const [existing] = await db.query(
    'SELECT id FROM classes WHERE name = ? AND section = ? AND department_id = ? LIMIT 1',
    [name, section, departmentId]
  );
  if (existing.length) return existing[0].id;

  const [result] = await db.query(
    'INSERT INTO classes (name, section, department_id) VALUES (?, ?, ?)',
    [name, section, departmentId]
  );
  return result.insertId;
}

async function getOrCreateSubject(name, classId, teacherId) {
  const [existing] = await db.query(
    'SELECT id FROM subjects WHERE name = ? AND class_id = ? AND teacher_id = ? LIMIT 1',
    [name, classId, teacherId]
  );
  if (existing.length) return existing[0].id;

  const [result] = await db.query(
    'INSERT INTO subjects (name, class_id, teacher_id) VALUES (?, ?, ?)',
    [name, classId, teacherId]
  );
  return result.insertId;
}

async function upsertStudent({ name, email, rollNumber, parentPhone, parentEmail, classId }) {
  const userId = await upsertUser({ name, email, role: 'student' });

  const [existing] = await db.query(
    'SELECT id FROM students WHERE user_id = ? OR roll_number = ? LIMIT 1',
    [userId, rollNumber]
  );

  if (existing.length) {
    await db.query(
      'UPDATE students SET user_id = ?, roll_number = ?, parent_phone = ?, parent_email = ?, class_id = ? WHERE id = ?',
      [userId, rollNumber, parentPhone, parentEmail, classId, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await db.query(
    'INSERT INTO students (user_id, roll_number, parent_phone, parent_email, class_id) VALUES (?, ?, ?, ?, ?)',
    [userId, rollNumber, parentPhone, parentEmail, classId]
  );

  return result.insertId;
}

async function insertTimetableSlot(classId, subjectId, day, period) {
  const [existing] = await db.query(
    'SELECT id FROM timetable WHERE class_id = ? AND subject_id = ? AND day_of_week = ? AND period_no = ? LIMIT 1',
    [classId, subjectId, day, period]
  );
  if (existing.length) return;

  await db.query(
    'INSERT INTO timetable (class_id, subject_id, day_of_week, period_no) VALUES (?, ?, ?, ?)',
    [classId, subjectId, day, period]
  );
}

async function seedAttendance(students, subjects) {
  const today = new Date();
  const yyyyMmDd = (date) => date.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sessions = [
    { date: yyyyMmDd(today), subjectId: subjects.dbms, period: 1, statuses: ['P', 'A', 'P', 'L'] },
    { date: yyyyMmDd(today), subjectId: subjects.os, period: 2, statuses: ['P', 'P', 'A', 'P'] },
    { date: yyyyMmDd(yesterday), subjectId: subjects.dbms, period: 1, statuses: ['P', 'P', 'P', 'A'] },
  ];

  for (const session of sessions) {
    const values = students.map((studentId, index) => [
      studentId,
      session.subjectId,
      session.date,
      session.period,
      session.statuses[index] || 'P',
    ]);

    await db.query(
      `
      INSERT IGNORE INTO attendance (student_id, subject_id, date, period_no, status)
      VALUES ?
    `,
      [values]
    );
  }
}

async function main() {
  const cseDepartmentId = await upsertDepartment('Computer Science Engineering');

  await upsertUser({
    name: 'Admin',
    email: 'admin@mgit.ac.in',
    role: 'admin',
  });

  await upsertUser({
    name: 'Dr. Kavitha Rao',
    email: 'hod.cse@mgit.ac.in',
    role: 'hod',
    departmentId: cseDepartmentId,
  });

  const teacherId = await upsertUser({
    name: 'Mr. Sharma',
    email: 'sharma@mgit.ac.in',
    role: 'teacher',
    departmentId: cseDepartmentId,
  });

  const classAId = await getOrCreateClass('CSE 3rd Year', 'A', cseDepartmentId);
  const classBId = await getOrCreateClass('CSE 3rd Year', 'B', cseDepartmentId);

  const dbmsSubjectId = await getOrCreateSubject('Database Management Systems', classAId, teacherId);
  const osSubjectId = await getOrCreateSubject('Operating Systems', classAId, teacherId);
  await getOrCreateSubject('Computer Networks', classBId, teacherId);

  const studentIds = [];
  studentIds.push(await upsertStudent({
    name: 'Ravi Kumar',
    email: 'ravi@mgit.ac.in',
    rollNumber: '22CSE001',
    parentPhone: '9876543210',
    parentEmail: 'parent.ravi@example.com',
    classId: classAId,
  }));
  studentIds.push(await upsertStudent({
    name: 'Ananya Reddy',
    email: 'ananya@mgit.ac.in',
    rollNumber: '22CSE002',
    parentPhone: '9876543211',
    parentEmail: 'parent.ananya@example.com',
    classId: classAId,
  }));
  studentIds.push(await upsertStudent({
    name: 'Kiran Varma',
    email: 'kiran@mgit.ac.in',
    rollNumber: '22CSE003',
    parentPhone: '9876543212',
    parentEmail: 'parent.kiran@example.com',
    classId: classAId,
  }));
  studentIds.push(await upsertStudent({
    name: 'Meghana Rao',
    email: 'meghana@mgit.ac.in',
    rollNumber: '22CSE004',
    parentPhone: '9876543213',
    parentEmail: 'parent.meghana@example.com',
    classId: classAId,
  }));

  await insertTimetableSlot(classAId, dbmsSubjectId, 'Monday', 1);
  await insertTimetableSlot(classAId, osSubjectId, 'Monday', 2);
  await insertTimetableSlot(classAId, dbmsSubjectId, 'Tuesday', 1);
  await insertTimetableSlot(classAId, osSubjectId, 'Wednesday', 3);

  await seedAttendance(studentIds, { dbms: dbmsSubjectId, os: osSubjectId });

  console.log('Campus Connect demo data is ready.');
  console.log('Demo password for seeded users:', DEMO_PASSWORD);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
