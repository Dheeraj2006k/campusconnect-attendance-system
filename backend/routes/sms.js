const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { MAX_SMS_RETRIES, retryLoggedSMS } = require('../utils/smsService');

const VALID_TRIGGER_TYPES = ['absent', 'streak', 'warning', 'weekly'];
const VALID_STATUSES = ['sent', 'failed'];

function parsePositiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// GET /api/sms/logs
// Query filters: date_from, date_to, trigger_type, status, student_id, limit, offset
router.get('/logs', auth(['admin', 'hod']), async (req, res) => {
  const {
    date_from,
    date_to,
    trigger_type,
    status,
    student_id,
  } = req.query;

  if (trigger_type && !VALID_TRIGGER_TYPES.includes(trigger_type)) {
    return res.status(400).json({ message: 'Invalid trigger_type filter' });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status filter' });
  }

  const limit = parsePositiveInt(req.query.limit, 50, 200);
  const offset = parsePositiveInt(req.query.offset, 0, 100000);
  const where = [];
  const params = [];

  if (req.user.role === 'hod') {
    if (!req.user.department_id) {
      return res.status(403).json({ message: 'Department access not configured for this user' });
    }

    where.push('c.department_id = ?');
    params.push(req.user.department_id);
  }

  if (date_from) {
    where.push('DATE(sl.sent_at) >= ?');
    params.push(date_from);
  }

  if (date_to) {
    where.push('DATE(sl.sent_at) <= ?');
    params.push(date_to);
  }

  if (trigger_type) {
    where.push('sl.trigger_type = ?');
    params.push(trigger_type);
  }

  if (status) {
    where.push('sl.status = ?');
    params.push(status);
  }

  if (student_id) {
    where.push('sl.student_id = ?');
    params.push(student_id);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows] = await db.query(
      `
      SELECT
        sl.id,
        sl.student_id,
        u.name AS student_name,
        s.roll_number,
        c.name AS class_name,
        c.section,
        c.department_id,
        d.name AS department_name,
        sl.phone,
        sl.message,
        sl.trigger_type,
        sl.status,
        sl.retry_count,
        sl.sent_at
      FROM sms_logs sl
      JOIN students s ON sl.student_id = s.id
      JOIN users u ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      JOIN departments d ON c.department_id = d.id
      ${whereSql}
      ORDER BY sl.sent_at DESC, sl.id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, limit, offset]
    );

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sms_logs sl
      JOIN students s ON sl.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      ${whereSql}
    `,
      params
    );

    res.json({
      total: countRows[0].total,
      limit,
      offset,
      max_retry_count: MAX_SMS_RETRIES,
      data: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/sms/retry/:logId
router.post('/retry/:logId', auth(['admin']), async (req, res) => {
  try {
    const result = await retryLoggedSMS(req.params.logId);

    if (!result.ok) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    res.status(201).json({
      message: result.status === 'sent' ? 'SMS retry sent' : 'SMS retry failed and was logged',
      original_log_id: result.original_log_id,
      retry_log_id: result.id,
      status: result.status,
      retry_count: result.retry_count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
