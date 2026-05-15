require('dotenv').config();
const db = require('../config/db');
const { sendAbsentSMS } = require('../utils/smsService');

async function main() {
  const studentId = Number(process.argv[2] || 1);
  const date = process.argv[3] || new Date().toISOString().slice(0, 10);

  const [students] = await db.query(
    `
    SELECT s.id, s.parent_phone, s.parent_email, s.roll_number, u.name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
    LIMIT 1
  `,
    [studentId]
  );

  if (!students.length) {
    console.error(`Student ${studentId} not found.`);
    process.exit(1);
  }

  const student = students[0];
  console.log(
    `Sending absent notification test to ${student.name} (${student.roll_number}) parent email ${student.parent_email || 'not set'}`
  );

  await sendAbsentSMS([studentId], date);

  const [logs] = await db.query(
    `
    SELECT id, phone, trigger_type, status, retry_count, sent_at
    FROM sms_logs
    WHERE student_id = ?
    ORDER BY id DESC
    LIMIT 5
  `,
    [studentId]
  );

  console.table(logs);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
