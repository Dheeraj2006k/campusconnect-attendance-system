import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import useAttendanceRealtime from '../hooks/useAttendanceRealtime';
import api from '../api/axios';

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function formatPercent(value) {
  if (value === null || value === undefined) return '--';
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function StudentDashboard() {
  const [overview, setOverview] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useAttendanceRealtime(() => setRefreshKey((current) => current + 1));

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const overviewRes = await api.get('/dashboard/overview');
        const studentId = overviewRes.data?.student?.id;
        let reportRes = null;

        if (studentId) {
          reportRes = await api.get(`/reports/student/${studentId}`);
        }

        if (!active) return;
        setOverview(overviewRes.data);
        setReport(reportRes?.data || null);
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || 'Unable to load student attendance.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const overall = report?.overall || overview?.overall || {};
  const lowSubjects = report?.subject_summary?.filter((subject) => Boolean(subject.low_attendance)) || overview?.low_subjects || [];
  const recentHistory = useMemo(() => (report?.history || []).slice(0, 12), [report]);

  return (
    <AppShell
      title="Student Attendance"
      subtitle="Review your attendance percentage, subject status, and period history."
    >
      <div className="page-grid">
        <div className={`stat-card${overall.low_attendance ? ' stat-card-danger' : ' stat-card-success'}`}>
          <p className="stat-label">Overall</p>
          <p className="stat-value">{loading ? '--' : formatPercent(overall.percentage)}</p>
          <p className="stat-note">Attendance percentage</p>
        </div>
        <div className="stat-card stat-card-success">
          <p className="stat-label">Present</p>
          <p className="stat-value">{loading ? '--' : formatNumber(overall.present)}</p>
          <p className="stat-note">Total periods</p>
        </div>
        <div className="stat-card stat-card-danger">
          <p className="stat-label">Absent</p>
          <p className="stat-value">{loading ? '--' : formatNumber(overall.absent)}</p>
          <p className="stat-note">Total periods</p>
        </div>
        <div className="stat-card stat-card-warning">
          <p className="stat-label">Late</p>
          <p className="stat-value">{loading ? '--' : formatNumber(overall.late)}</p>
          <p className="stat-note">Total periods</p>
        </div>
      </div>

      {error && <div className="inline-alert">{error}</div>}

      {!loading && lowSubjects.length > 0 && (
        <div className="student-warning">
          <div>
            <strong>Attendance attention needed</strong>
            <span>{lowSubjects.length} subject{lowSubjects.length === 1 ? '' : 's'} below the {report?.threshold || overview?.threshold || 75}% threshold.</span>
          </div>
        </div>
      )}

      <div className="student-dashboard-grid">
        <section className="panel-card">
          <div className="panel-heading">
            <div>
              <h2>Subject Breakdown</h2>
              <p>{loading ? 'Loading subjects...' : `${report?.subject_summary?.length || 0} subjects tracked.`}</p>
            </div>
            {overview?.student?.roll_number && <span className="panel-pill">{overview.student.roll_number}</span>}
          </div>

          {loading && (
            <div className="activity-list" aria-label="Loading subjects">
              {[1, 2, 3].map((item) => (
                <div className="activity-item skeleton-row" key={item} />
              ))}
            </div>
          )}

          {!loading && (!report?.subject_summary || report.subject_summary.length === 0) && (
            <div className="empty-state">
              <h3>No attendance records yet</h3>
              <p>Your subject percentages will appear after teachers start marking attendance.</p>
            </div>
          )}

          {!loading && report?.subject_summary?.length > 0 && (
            <div className="subject-progress-list">
              {report.subject_summary.map((subject) => {
                const percentage = Number(subject.percentage || 0);
                return (
                  <div className="subject-progress-row" key={subject.subject_id}>
                    <div className="subject-progress-heading">
                      <div>
                        <strong>{subject.subject}</strong>
                        <span>
                          {formatNumber(subject.present)} present · {formatNumber(subject.absent)} absent · {formatNumber(subject.late)} late
                        </span>
                      </div>
                      <span className={`risk-badge${subject.low_attendance ? ' risk' : ''}`}>
                        {formatPercent(subject.percentage)}
                      </span>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <span
                        className={subject.low_attendance ? 'risk' : ''}
                        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-heading">
            <div>
              <h2>Recent History</h2>
              <p>Your latest marked periods.</p>
            </div>
          </div>

          {!loading && recentHistory.length === 0 && (
            <div className="empty-state">
              <h3>No period history yet</h3>
              <p>Attendance history appears here after marked classes.</p>
            </div>
          )}

          {recentHistory.length > 0 && (
            <div className="history-list">
              {recentHistory.map((item) => (
                <div className="history-row" key={item.id}>
                  <div>
                    <strong>{item.subject}</strong>
                    <span>{formatDate(item.date)} · Period {item.period_no}</span>
                  </div>
                  <span className={`attendance-status status-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
