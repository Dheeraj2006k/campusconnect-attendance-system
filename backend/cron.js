const cron = require('node-cron');
const db = require('./config/db');
const { sendWeeklySMS } = require('./utils/smsService');

const WEEKLY_SMS_THRESHOLD = Number(process.env.WEEKLY_SMS_THRESHOLD || 85);

cron.schedule(
  '0 8 * * 1',
  async () => {
    console.log('[CRON] Weekly notification job started:', new Date().toISOString());

    try {
      let sentCount = 0;
      let skippedCount = 0;

      const [students] = await db.query(`
        SELECT s.id, s.parent_email, u.email, s.roll_number, u.name
        FROM students s
        JOIN users u ON s.user_id = u.id
      `);

      for (const student of students) {
        const [summary] = await db.query(
          `
          SELECT
            sub.name AS subject,
            COUNT(*) AS total_classes,
            SUM(a.status = 'P') AS present,
            SUM(a.status = 'A') AS absent,
            SUM(a.status = 'L') AS late,
            ROUND(SUM(a.status = 'P') * 100.0 / COUNT(*), 2) AS percentage
          FROM attendance a
          JOIN subjects sub ON a.subject_id = sub.id
          WHERE a.student_id = ?
            AND a.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
          GROUP BY a.subject_id, sub.name
        `,
          [student.id]
        );

        if (summary.length === 0) continue;

        const lowSubjects = summary.filter(
          (item) => Number(item.percentage) < WEEKLY_SMS_THRESHOLD
        );

        if (lowSubjects.length === 0) {
          skippedCount += 1;
          continue;
        }

        await sendWeeklySMS(
          student.id,
          student.parent_email || student.email,
          student.name,
          student.roll_number,
          lowSubjects,
          WEEKLY_SMS_THRESHOLD
        );
        sentCount += 1;
      }

      console.log(
        `[CRON] Weekly notification job completed. Sent: ${sentCount}, skipped healthy students: ${skippedCount}`
      );
    } catch (err) {
      console.error('[CRON] Job failed:', err.message);
    }
  },
  {
    timezone: 'Asia/Kolkata',
  }
);

console.log(`[CRON] Weekly notification scheduler registered (Mon 8AM IST, threshold ${WEEKLY_SMS_THRESHOLD}%)`);
