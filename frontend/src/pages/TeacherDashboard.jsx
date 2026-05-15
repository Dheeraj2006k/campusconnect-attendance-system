import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import useAttendanceRealtime from '../hooks/useAttendanceRealtime';
import api from '../api/axios';

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return 'Today';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function TeacherDashboard() {
  const [overview, setOverview] = useState(null);
  const [activity, setActivity] = useState([]);
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
        const [overviewRes, activityRes] = await Promise.all([
          api.get('/dashboard/overview'),
          api.get('/dashboard/activity', { params: { limit: 8 } }),
        ]);

        if (!active) return;
        setOverview(overviewRes.data);
        setActivity(activityRes.data?.data || []);
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || 'Unable to load teacher dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const stats = useMemo(
    () => [
      {
        label: 'Subjects',
        value: overview?.totals?.assigned_subjects,
        note: 'Assigned to you',
      },
      {
        label: 'Classes',
        value: overview?.totals?.assigned_classes,
        note: 'Teaching groups',
      },
      {
        label: 'Today Records',
        value: overview?.today?.attendance_records,
        note: 'Marked by you',
        tone: 'success',
      },
      {
        label: 'Absences',
        value: overview?.today?.absent_records,
        note: 'Today in your subjects',
        tone: 'danger',
      },
    ],
    [overview]
  );

  return (
    <AppShell
      title="Teacher Workspace"
      subtitle="Mark attendance quickly and review your assigned class activity."
    >
      <div className="page-grid">
        {stats.map((stat) => (
          <div className={`stat-card${stat.tone ? ` stat-card-${stat.tone}` : ''}`} key={stat.label}>
            <p className="stat-label">{stat.label}</p>
            <p className="stat-value">{loading ? '--' : formatNumber(stat.value)}</p>
            <p className="stat-note">{stat.note}</p>
          </div>
        ))}
      </div>

      {error && <div className="inline-alert">{error}</div>}

      <div className="dashboard-columns">
        <div className="panel-card activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Your Attendance Activity</h2>
              <p>Recent periods submitted for your assigned subjects.</p>
            </div>
            <span className="panel-pill">{loading ? 'Syncing' : `${activity.length} updates`}</span>
          </div>

          {loading && (
            <div className="activity-list" aria-label="Loading activity">
              {[1, 2, 3].map((item) => (
                <div className="activity-item skeleton-row" key={item} />
              ))}
            </div>
          )}

          {!loading && activity.length === 0 && (
            <div className="empty-state">
              <h3>No attendance marked yet</h3>
              <p>Submitted periods will appear here after you mark attendance.</p>
            </div>
          )}

          {!loading && activity.length > 0 && (
            <div className="activity-list">
              {activity.map((item) => (
                <article
                  className="activity-item"
                  key={`${item.subject_id}-${item.class_id}-${item.date}-${item.period_no}`}
                >
                  <div className="activity-mark">
                    <span>{item.absent_count || 0}</span>
                    <small>ABS</small>
                  </div>
                  <div className="activity-body">
                    <div className="activity-title-row">
                      <h3>{item.subject_name}</h3>
                      <span className="activity-time">{formatTime(item.submitted_at)}</span>
                    </div>
                    <p>
                      {item.class_name} {item.section} · Period {item.period_no}
                    </p>
                    <div className="activity-meta">
                      <span>{formatDate(item.date)}</span>
                      <span>{formatNumber(item.present_count)} P</span>
                      <span>{formatNumber(item.late_count)} L</span>
                      <span>{formatNumber(item.total)} total</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="panel-card operations-panel">
          <div className="panel-heading">
            <div>
              <h2>Teaching Scope</h2>
              <p>Current assignment coverage for attendance workflows.</p>
            </div>
          </div>

          <div className="snapshot-list">
            <div className="snapshot-row">
              <span>Assigned classes</span>
              <strong>{loading ? '--' : formatNumber(overview?.totals?.assigned_classes)}</strong>
            </div>
            <div className="snapshot-row">
              <span>Assigned subjects</span>
              <strong>{loading ? '--' : formatNumber(overview?.totals?.assigned_subjects)}</strong>
            </div>
            <div className="snapshot-row">
              <span>Students taught</span>
              <strong>{loading ? '--' : formatNumber(overview?.totals?.students_taught)}</strong>
            </div>
            <div className="snapshot-row">
              <span>Today absences</span>
              <strong>{loading ? '--' : formatNumber(overview?.today?.absent_records)}</strong>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
