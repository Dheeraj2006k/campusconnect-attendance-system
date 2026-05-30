const db = require('./db');
const { DEFAULT_ATTENDANCE_THRESHOLD } = require('../utils/attendancePrediction');
const { getDefaultAcademicYear } = require('../utils/academicTerms');

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await db.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
  `,
    [tableName, columnName]
  );

  if (rows.length > 0) return;

  await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS academic_terms (
      id INT NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      academic_year VARCHAR(20) NOT NULL,
      semester INT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_academic_terms_active (is_active),
      KEY idx_academic_terms_dates (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await ensureColumn(
    'classes',
    'attendance_threshold',
    `DECIMAL(5,2) NOT NULL DEFAULT ${DEFAULT_ATTENDANCE_THRESHOLD.toFixed(2)}`
  );

  await ensureColumn('attendance', 'term_id', 'INT NULL');

  await db.query(`
    ALTER TABLE sms_logs
    MODIFY trigger_type ENUM('absent', 'late', 'streak', 'warning', 'weekly') NOT NULL
  `);

  const [activeTerms] = await db.query('SELECT id FROM academic_terms WHERE is_active = 1 LIMIT 1');
  if (activeTerms.length === 0) {
    const now = new Date();
    const year = now.getFullYear();
    const academicYear = getDefaultAcademicYear(now);
    await db.query(
      `
      INSERT INTO academic_terms (name, academic_year, semester, start_date, end_date, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      [`${academicYear} Current Term`, academicYear, 1, `${year}-01-01`, `${year}-12-31`]
    );
  }

  await db.query(`
    UPDATE attendance a
    JOIN academic_terms t ON a.date BETWEEN t.start_date AND t.end_date
    SET a.term_id = t.id
    WHERE a.term_id IS NULL
  `);

  await db.query(`
    UPDATE attendance a
    JOIN academic_terms t ON t.is_active = 1
    SET a.term_id = t.id
    WHERE a.term_id IS NULL
  `);
}

module.exports = ensureSchema;
