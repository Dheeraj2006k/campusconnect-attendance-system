const nodemailer = require('nodemailer');
const db = require('../config/db');
const { DEFAULT_ATTENDANCE_THRESHOLD, normalizeThreshold } = require('./attendancePrediction');
const { getActiveTerm } = require('./academicTerms');

const MAX_SMS_RETRIES = 3;
const LOW_ATTENDANCE_THRESHOLD = DEFAULT_ATTENDANCE_THRESHOLD;

let gmailTransporter;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const withoutCountryCode = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits;

  if (!/^[6-9]\d{9}$/.test(withoutCountryCode)) {
    throw new Error('Invalid Indian mobile number. Use a 10-digit number starting with 6, 7, 8, or 9.');
  }

  return withoutCountryCode;
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) {
    throw new Error('Notification email is not configured');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Notification recipient must be a valid email address');
  }

  return value;
}

function getNotificationRecipient(email) {
  return normalizeEmail(email);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getSubjectNotificationLabel(subjectId) {
  if (!subjectId) return null;

  const [rows] = await db.query(
    `
    SELECT sub.name AS subject_name, c.name AS class_name, c.section
    FROM subjects sub
    JOIN classes c ON sub.class_id = c.id
    WHERE sub.id = ?
    LIMIT 1
  `,
    [subjectId]
  );

  if (!rows.length) return null;

  const { subject_name, class_name, section } = rows[0];
  return section
    ? `${subject_name} (${class_name} - ${section})`
    : `${subject_name} (${class_name})`;
}

async function sendAbsentSMS(studentIds, date, subjectId = null, periodNo = null, type = 'absent') {
  const subjectLabel = await getSubjectNotificationLabel(subjectId);
  const periodInfo = periodNo ? `, Period ${periodNo}` : '';
  const classInfo = subjectLabel ? ` for ${subjectLabel}${periodInfo}` : '';

  for (const studentId of studentIds) {
    const [rows] = await db.query(
      `
      SELECT s.parent_email, u.email, u.name, s.roll_number
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `,
      [studentId]
    );

    if (!rows.length) continue;

    const { parent_email, email, name, roll_number } = rows[0];
    const message = type === 'late'
      ? `Dear Parent, ${name} (${roll_number}) was marked LATE${classInfo} on ${date}. - MGIT Attendance System`
      : `Dear Parent, ${name} (${roll_number}) was marked ABSENT${classInfo} on ${date}. - MGIT Attendance System`;

    await dispatchSMSWithRetry(parent_email || email, message, studentId, type);
  }
}

async function sendWeeklySMS(studentId, email, name, rollNo, summary, threshold = 85) {
  const lines = summary
    .map((item) => `${item.subject}: ${item.percentage}%`)
    .join(', ');
  const message = `Weekly Attendance Alert: ${name} (${rollNo}) is below ${threshold}% in ${lines}. Please contact the department if needed. - MGIT`;

  await dispatchSMSWithRetry(email, message, studentId, 'weekly');
}

async function getStudentSMSProfile(studentId) {
  const [rows] = await db.query(
    `
    SELECT s.id, s.parent_email, u.email, s.roll_number, u.name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
    LIMIT 1
  `,
    [studentId]
  );

  return rows[0] || null;
}

async function getSubjectName(subjectId) {
  const [rows] = await db.query('SELECT name FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
  return rows[0]?.name || null;
}

async function wasAlertSentToday(studentId, triggerType, messageMarker) {
  const [rows] = await db.query(
    `
    SELECT id
    FROM sms_logs
    WHERE student_id = ?
      AND trigger_type = ?
      AND DATE(sent_at) = CURDATE()
      AND message LIKE ?
    LIMIT 1
  `,
    [studentId, triggerType, `%${messageMarker}%`]
  );

  return rows.length > 0;
}

async function sendLowAttendanceWarning(studentId, subjectId) {
  const activeTerm = await getActiveTerm();
  const termFilter = activeTerm ? 'AND a.term_id = ?' : '';
  const params = activeTerm ? [studentId, subjectId, activeTerm.id] : [studentId, subjectId];

  const [rows] = await db.query(
    `
    SELECT
      COUNT(*) AS total_classes,
      SUM(a.status = 'P') AS present,
      ROUND(SUM(a.status = 'P') * 100.0 / COUNT(*), 2) AS percentage,
      sub.name AS subject_name,
      c.attendance_threshold
    FROM attendance a
    JOIN subjects sub ON a.subject_id = sub.id
    JOIN classes c ON sub.class_id = c.id
    WHERE a.student_id = ? AND a.subject_id = ? ${termFilter}
    GROUP BY sub.id, sub.name, c.attendance_threshold
  `,
    params
  );

  const threshold = normalizeThreshold(rows[0]?.attendance_threshold);

  if (!rows.length || Number(rows[0].percentage) >= threshold) {
    return null;
  }

  const profile = await getStudentSMSProfile(studentId);
  if (!profile) return null;

  const subjectName = rows[0].subject_name;
  const marker = `${subjectName} attendance`;
  if (await wasAlertSentToday(studentId, 'warning', marker)) {
    return null;
  }

  const message = `Attendance Warning: ${profile.name} (${profile.roll_number}) has ${rows[0].percentage}% in ${subjectName} attendance, below ${threshold}%. - MGIT`;
  return dispatchSMSWithRetry(profile.parent_email || profile.email, message, studentId, 'warning');
}

async function sendConsecutiveAbsenceAlert(studentId, subjectId) {
  const [rows] = await db.query(
    `
    SELECT date, SUM(status = 'A') AS absent_count, COUNT(*) AS total_count
    FROM attendance
    WHERE student_id = ? AND subject_id = ?
    GROUP BY date
    ORDER BY date DESC
    LIMIT 3
  `,
    [studentId, subjectId]
  );

  if (rows.length < 3 || rows.some((row) => Number(row.absent_count) === 0)) {
    return null;
  }

  const profile = await getStudentSMSProfile(studentId);
  const subjectName = await getSubjectName(subjectId);
  if (!profile || !subjectName) return null;

  const marker = `${subjectName} for 3 consecutive`;
  if (await wasAlertSentToday(studentId, 'streak', marker)) {
    return null;
  }

  const message = `Attendance Alert: ${profile.name} (${profile.roll_number}) was absent in ${subjectName} for 3 consecutive class dates. Please contact the department. - MGIT`;
  return dispatchSMSWithRetry(profile.parent_email || profile.email, message, studentId, 'streak');
}

async function sendAttendanceRiskAlerts(studentIds, subjectId) {
  const results = [];
  const uniqueStudentIds = [...new Set(studentIds.map(Number).filter(Boolean))];

  for (const studentId of uniqueStudentIds) {
    const warning = await sendLowAttendanceWarning(studentId, subjectId);
    if (warning) results.push({ student_id: studentId, trigger_type: 'warning', ...warning });

    const streak = await sendConsecutiveAbsenceAlert(studentId, subjectId);
    if (streak) results.push({ student_id: studentId, trigger_type: 'streak', ...streak });
  }

  return results;
}

function getEmailSubject(triggerType) {
  if (triggerType === 'absent') return 'Campus Connect absent notification';
  if (triggerType === 'weekly') return 'Campus Connect weekly attendance alert';
  return 'Campus Connect attendance alert';
}

function renderNotificationHtml(message) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin: 0 0 12px; color: #0f766e;">Campus Connect</h2>
      <p>${escapeHtml(message)}</p>
      <p style="margin-top: 20px; color: #64748b;">MGIT Attendance System</p>
    </div>
  `;
}

function getGmailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error('Gmail config missing:', {
      GMAIL_USER: process.env.GMAIL_USER ? '***configured***' : '❌ NOT SET',
      GMAIL_PASS: process.env.GMAIL_PASS ? '***configured***' : '❌ NOT SET',
    });
    throw new Error('GMAIL_USER and GMAIL_PASS must be configured');
  }

  if (!gmailTransporter) {
    console.log('Creating Gmail transporter for:', process.env.GMAIL_USER);
    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });
    console.log('Gmail transporter created successfully');
  }

  return gmailTransporter;
}

async function sendGmailEmail(email, message, triggerType) {
  if (process.env.SMS_ENABLED === 'false') {
    throw new Error('Notifications are disabled by SMS_ENABLED=false');
  }

  const to = getNotificationRecipient(email);
  const transporter = getGmailTransporter();
  try {
    console.log('Attempting to send email to:', to);
    const info = await transporter.sendMail({
      from: `"Campus Connect" <${process.env.GMAIL_USER}>`,
      to,
      subject: getEmailSubject(triggerType),
      text: message,
      html: renderNotificationHtml(message),
    });
    console.log('Email sent successfully:', info.messageId);

    return { id: info.messageId, accepted: info.accepted, rejected: info.rejected };
  } catch (err) {
    console.error('SMTP error details:', {
      code: err.code,
      message: err.message,
      command: err.command,
      response: err.response,
    });
    throw err;
  }
}

async function dispatchSMS(recipient, message, studentId, triggerType, retryCount = 0) {
  let status = 'failed';
  let normalizedRecipient = String(recipient || '');

  try {
    normalizedRecipient = getNotificationRecipient(recipient);
    const providerResponse = await sendGmailEmail(normalizedRecipient, message, triggerType);
    console.log('Notification sent:', {
      studentId,
      triggerType,
      recipient: normalizedRecipient,
      provider: {
        name: 'gmail',
        id: providerResponse.id,
      },
    });
    status = 'sent';
  } catch (err) {
    console.error('Notification failed:', {
      studentId,
      triggerType,
      recipient,
      error: err.response?.data?.message || err.response?.data || err.message,
    });
  }

  const [result] = await db.query(
    `INSERT INTO sms_logs (student_id, phone, message, trigger_type, status, retry_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [studentId, normalizedRecipient, message, triggerType, status, retryCount]
  );

  return { id: result.insertId, status, retry_count: retryCount };
}

async function dispatchSMSWithRetry(phone, message, studentId, triggerType) {
  let latestAttempt = await dispatchSMS(phone, message, studentId, triggerType, 0);

  for (let retryCount = 1; latestAttempt.status === 'failed' && retryCount <= MAX_SMS_RETRIES; retryCount += 1) {
    await wait(1000 * 2 ** (retryCount - 1));
    latestAttempt = await dispatchSMS(phone, message, studentId, triggerType, retryCount);
  }

  return latestAttempt;
}

async function retryLoggedSMS(logId) {
  const [rows] = await db.query(
    `
    SELECT id, student_id, phone, message, trigger_type, status, retry_count
    FROM sms_logs
    WHERE id = ?
    LIMIT 1
  `,
    [logId]
  );

  if (!rows.length) {
    return { ok: false, statusCode: 404, message: 'Notification log not found' };
  }

  const log = rows[0];
  if (log.status !== 'failed') {
    return { ok: false, statusCode: 409, message: 'Only failed notification logs can be retried' };
  }

  if (log.retry_count >= MAX_SMS_RETRIES) {
    return { ok: false, statusCode: 409, message: 'Maximum retry limit reached' };
  }

  const attempt = await dispatchSMS(
    log.phone,
    log.message,
    log.student_id,
    log.trigger_type,
    log.retry_count + 1
  );

  await db.query('UPDATE sms_logs SET retry_count = ? WHERE id = ?', [
    log.retry_count + 1,
    log.id,
  ]);

  return { ok: true, original_log_id: log.id, ...attempt };
}

module.exports = {
  LOW_ATTENDANCE_THRESHOLD,
  MAX_SMS_RETRIES,
  dispatchSMS,
  dispatchSMSWithRetry,
  normalizeIndianPhone,
  normalizeEmail,
  retryLoggedSMS,
  sendAttendanceRiskAlerts,
  sendAbsentSMS,
  sendWeeklySMS,
};
