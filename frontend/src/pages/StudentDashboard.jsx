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

function getPredictionMetric(overall) {
  if (!overall || overall.percentage === null || overall.percentage === undefined) return '--';
  return overall.low_attendance
    ? formatNumber(overall.classes_needed_to_reach_threshold)
    : formatNumber(overall.classes_can_miss_safely);
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
  const previousOverall = report?.previous_overall;

  return (
    <AppShell
      title="Student Attendance"
      subtitle="Review your attendance percentage, subject status, and period history."
    >
      {!loading && overall.percentage !== null && overall.percentage !== undefined && (
        <section className={`student-hero-panel${overall.low_attendance ? ' risk' : ' safe'}`}>
          <div className="student-hero-copy">
            <span className="hero-status-label">{overall.low_attendance ? 'Action Required' : 'Safe Zone'}</span>
            <h2>{formatPercent(overall.percentage)}</h2>
            <p>{overall.prediction_message}</p>
          </div>
          <div className="student-hero-metric">
            <span>{overall.low_attendance ? 'Classes Needed' : 'Can Miss'}</span>
            <strong>{getPredictionMetric(overall)}</strong>
          </div>
        </section>
      )}

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
            <strong>Subject risk detected</strong>
            <span>{lowSubjects.length} subject{lowSubjects.length === 1 ? '' : 's'} below the {report?.threshold || overview?.threshold || 75}% threshold.</span>
          </div>
        </div>
      )}

      {!loading && (
        <section className="panel-card semester-comparison-panel">
          <div className="panel-heading">
            <div>
              <h2>Previous Semester</h2>
              <p>{report?.term?.name ? `Current view: ${report.term.name}` : 'Current semester comparison.'}</p>
            </div>
            {previousOverall?.trend && previousOverall.has_data && (
              <span className={`risk-badge${previousOverall.trend === 'declining' ? ' risk' : ''}`}>
                {previousOverall.trend}
              </span>
            )}
          </div>

          {!previousOverall?.has_data && (
            <div className="empty-state">
              <h3>No previous semester data available</h3>
              <p>Comparison will appear after older semester attendance is linked to an academic term.</p>
            </div>
          )}

          {previousOverall?.has_data && (
            <div className="comparison-grid">
              <div>
                <span>Previous</span>
                <strong>{formatPercent(previousOverall.percentage)}</strong>
                <small>{previousOverall.term?.name}</small>
              </div>
              <div>
                <span>Current</span>
                <strong>{formatPercent(overall.percentage)}</strong>
                <small>{report?.term?.name}</small>
              </div>
              <div>
                <span>Difference</span>
                <strong>{previousOverall.difference_percentage > 0 ? '+' : ''}{formatPercent(previousOverall.difference_percentage)}</strong>
                <small>{formatNumber(previousOverall.present)} / {formatNumber(previousOverall.total_classes)} previous</small>
              </div>
            </div>
          )}
        </section>
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
                        {subject.prediction_message && <span>{subject.prediction_message}</span>}
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
