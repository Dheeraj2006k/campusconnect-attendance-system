import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const triggerOptions = [
  ['absent', 'Absent'],
  ['streak', '3-day streak'],
  ['warning', '75% warning'],
  ['weekly', 'Weekly'],
];

function todayInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

export default function SmsLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [maxRetryCount, setMaxRetryCount] = useState(3);
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: todayInputValue(),
    trigger_type: '',
    status: '',
  });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const failedCount = useMemo(() => logs.filter((log) => log.status === 'failed').length, [logs]);
  const sentCount = useMemo(() => logs.filter((log) => log.status === 'sent').length, [logs]);

  async function loadLogs() {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/sms/logs', {
        params: {
          ...filters,
          date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined,
          trigger_type: filters.trigger_type || undefined,
          status: filters.status || undefined,
          limit: pageSize,
          offset: page * pageSize,
        },
      });

      setLogs(res.data?.data || []);
      setTotal(Number(res.data?.total || 0));
      setMaxRetryCount(Number(res.data?.max_retry_count || 3));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load notification logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [filters, page]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(0);
    setMessage('');
  }

  function clearFilters() {
    setFilters({
      date_from: '',
      date_to: todayInputValue(),
      trigger_type: '',
      status: '',
    });
    setPage(0);
    setMessage('');
    setError('');
  }

  async function retrySms(log) {
    const confirmed = window.confirm(`Retry notification for ${log.student_name}?`);
    if (!confirmed) return;

    try {
      setRetryingId(log.id);
      setMessage('');
      setError('');
      const res = await api.post(`/sms/retry/${log.id}`);
      setMessage(`${res.data.message}. New log #${res.data.retry_log_id}.`);
      await loadLogs();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to retry notification.');
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <AppShell
      title={isAdmin ? 'Notification Logs' : 'Department Notifications'}
      subtitle="Audit parent alert delivery, filter triggers, and review failed notification attempts."
    >
      <section className="panel-card report-filter-panel">
        <div className="panel-heading">
          <div>
            <h2>Filters</h2>
            <p>Review sent and failed notification attempts by date, trigger, and status.</p>
          </div>
          <button className="secondary-button" type="button" onClick={clearFilters}>
            Clear
          </button>
        </div>

        <div className="control-grid sms-filter-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="sms-from">From</label>
            <input
              id="sms-from"
              className="form-input"
              type="date"
              value={filters.date_from}
              onChange={(event) => updateFilter('date_from', event.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="sms-to">To</label>
            <input
              id="sms-to"
              className="form-input"
              type="date"
              value={filters.date_to}
              onChange={(event) => updateFilter('date_to', event.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="sms-trigger">Trigger</label>
            <select
              id="sms-trigger"
              className="form-input"
              value={filters.trigger_type}
              onChange={(event) => updateFilter('trigger_type', event.target.value)}
            >
              <option value="">All triggers</option>
              {triggerOptions.map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="sms-status">Status</label>
            <select
              id="sms-status"
              className="form-input"
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </section>

      <div className="page-grid report-stat-grid">
        <div className="stat-card">
          <p className="stat-label">Total Logs</p>
          <p className="stat-value">{loading ? '--' : formatNumber(total)}</p>
          <p className="stat-note">Matching filters</p>
        </div>
        <div className="stat-card stat-card-success">
          <p className="stat-label">Sent On Page</p>
          <p className="stat-value">{loading ? '--' : formatNumber(sentCount)}</p>
          <p className="stat-note">Delivered attempts</p>
        </div>
        <div className="stat-card stat-card-danger">
          <p className="stat-label">Failed On Page</p>
          <p className="stat-value">{loading ? '--' : formatNumber(failedCount)}</p>
          <p className="stat-note">Needs attention</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Retry Limit</p>
          <p className="stat-value">{formatNumber(maxRetryCount)}</p>
          <p className="stat-note">Per failed notification</p>
        </div>
      </div>

      <section className="panel-card sms-log-panel">
        <div className="panel-heading">
          <div>
            <h2>Notification Audit Trail</h2>
            <p>{loading ? 'Loading notification logs...' : `Showing ${logs.length} of ${total} records.`}</p>
          </div>
          <span className="panel-pill">Page {page + 1} / {pageCount}</span>
        </div>

        {message && <div className="inline-success">{message}</div>}
        {error && <div className="inline-alert">{error}</div>}

        {!loading && logs.length === 0 && (
          <div className="empty-state">
            <h3>No notification logs found</h3>
            <p>Try changing the filters or wait for attendance alerts to run.</p>
          </div>
        )}

        {logs.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table sms-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Recipient</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Retry</th>
                  <th>Message</th>
                  {isAdmin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const canRetry = isAdmin && log.status === 'failed' && Number(log.retry_count || 0) < maxRetryCount;
                  return (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.sent_at)}</td>
                      <td>
                        <strong>{log.student_name}</strong>
                        <span className="table-subtext">{log.roll_number}</span>
                      </td>
                      <td>{log.class_name} {log.section}</td>
                      <td>{log.phone}</td>
                      <td><span className="trigger-badge">{log.trigger_type}</span></td>
                      <td>
                        <span className={`risk-badge${log.status === 'failed' ? ' risk' : ''}`}>
                          {log.status}
                        </span>
                      </td>
                      <td>{formatNumber(log.retry_count)} / {maxRetryCount}</td>
                      <td className="sms-message-cell">{log.message}</td>
                      {isAdmin && (
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              disabled={!canRetry || retryingId === log.id}
                              onClick={() => retrySms(log)}
                            >
                              {retryingId === log.id ? 'Retrying' : 'Retry'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-bar">
          <button
            className="secondary-button"
            type="button"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </button>
          <span>{formatNumber(page * pageSize + (logs.length ? 1 : 0))} - {formatNumber(page * pageSize + logs.length)} of {formatNumber(total)}</span>
          <button
            className="secondary-button"
            type="button"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </AppShell>
  );
}
