const db = require('../config/db');

function getDefaultAcademicYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

async function getActiveTerm() {
  const [rows] = await db.query(
    `
    SELECT id, name, academic_year, semester, start_date, end_date, is_active
    FROM academic_terms
    WHERE is_active = 1
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `
  );

  return rows[0] || null;
}

async function getTermById(termId) {
  if (!termId) return null;

  const [rows] = await db.query(
    `
    SELECT id, name, academic_year, semester, start_date, end_date, is_active
    FROM academic_terms
    WHERE id = ?
    LIMIT 1
  `,
    [termId]
  );

  return rows[0] || null;
}

async function resolveTermForDate(date) {
  const [rows] = await db.query(
    `
    SELECT id, name, academic_year, semester, start_date, end_date, is_active
    FROM academic_terms
    WHERE ? BETWEEN start_date AND end_date
    ORDER BY is_active DESC, start_date DESC, id DESC
    LIMIT 1
  `,
    [date]
  );

  if (rows.length > 0) return rows[0];
  return getActiveTerm();
}

async function getSelectedTerm(termId) {
  if (termId) return getTermById(termId);
  return getActiveTerm();
}

async function getPreviousTerm(term) {
  if (!term) return null;

  const [rows] = await db.query(
    `
    SELECT id, name, academic_year, semester, start_date, end_date, is_active
    FROM academic_terms
    WHERE start_date < ?
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `,
    [term.start_date]
  );

  return rows[0] || null;
}

module.exports = {
  getActiveTerm,
  getDefaultAcademicYear,
  getPreviousTerm,
  getSelectedTerm,
  getTermById,
  resolveTermForDate,
};
