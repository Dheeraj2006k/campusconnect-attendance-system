import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function formatPercent(value) {
  if (value === null || value === undefined) return '--';
  return `${Number(value || 0).toFixed(2)}%`;
}

function todayInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function TeacherReports() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(todayInputValue());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');

  const classOptions = useMemo(
    () => classes.map((item) => ({
      value: String(item.id),
      label: `${item.name} ${item.section}`,
    })),
    [classes]
  );

  const lowAttendanceStudents = useMemo(
    () => (report?.student_summary || []).filter((student) => Boolean(student.low_attendance)),
    [report]
  );

  async function loadClasses() {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/admin/classes');
      const loadedClasses = res.data || [];
      setClasses(loadedClasses);
      setSelectedClassId(loadedClasses[0]?.id ? String(loadedClasses[0].id) : '');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load assigned classes.');
    } finally {
      setLoading(false);
    }
  }

  async function loadReport() {
    if (!selectedClassId) {
      setReport(null);
      return;
    }

    try {
      setReportLoading(true);
      setError('');
      const res = await api.get(`/reports/class/${selectedClassId}`, {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load class report.');
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadReport();
  }, [selectedClassId, dateFrom, dateTo]);

  return (
    <AppShell
      title="Teacher Reports"
      subtitle="Review attendance performance for your assigned classes and subjects."
    >
      <section className="panel-card report-filter-panel">
        <div className="panel-heading">
          <div>
            <h2>Report Filters</h2>
            <p>Reports are scoped to classes and subjects assigned to you.</p>
          </div>
          <span className="panel-pill">Teacher scope</span>
        </div>

        <div className="control-grid report-controls">
          <div className="form-field">
            <label className="form-label" htmlFor="teacher-report-class">Class</label>
            <select
              id="teacher-report-class"
              className="form-input"
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
            >
              <option value="">Select class</option>
              {classOptions.map((item) => (
                <option value={item.value} key={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="teacher-report-from">From</label>
            <input
              id="teacher-report-from"
              className="form-input"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="teacher-report-to">To</label>
            <input
              id="teacher-report-to"
              className="form-input"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>
      </section>

      {error && <div className="inline-alert">{error}</div>}

      {!loading && classes.length === 0 && (
        <div className="empty-state">
          <h3>No assigned classes found</h3>
          <p>Reports appear after subjects are assigned to your teacher account.</p>
        </div>
      )}

      {report && (
        <>
          <div className="page-grid report-stat-grid">
            <div className="stat-card">
              <p className="stat-label">Your Subjects</p>
              <p className="stat-value">{formatNumber(report.subject_summary?.length)}</p>
              <p className="stat-note">In selected class</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Students</p>
              <p className="stat-value">{formatNumber(report.student_summary?.length)}</p>
              <p className="stat-note">Class roster</p>
            </div>
            <div className="stat-card stat-card-danger">
              <p className="stat-label">Low Attendance</p>
              <p className="stat-value">{formatNumber(lowAttendanceStudents.length)}</p>
              <p className="stat-note">Below {report.threshold}%</p>
            </div>
            <div className="stat-card stat-card-warning">
              <p className="stat-label">Absences</p>
              <p className="stat-value">
                {formatNumber((report.charts?.subject_absences || []).reduce(
                  (total, item) => total + Number(item.absent_count || 0),
                  0
                ))}
              </p>
              <p className="stat-note">In your subjects</p>
            </div>
          </div>

          <div className="report-columns">
            <section className="panel-card">
              <div className="panel-heading">
                <div>
                  <h2>Student Attendance</h2>
                  <p>{reportLoading ? 'Refreshing report...' : `${report.student_summary.length} student rows.`}</p>
                </div>
                <span className="panel-pill">{report.class.name} {report.class.section}</span>
              </div>

              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Roll No.</th>
                      <th>Student</th>
                      <th>Total</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Late</th>
                      <th>%</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.student_summary.map((student) => (
                      <tr key={student.student_id}>
                        <td><span className="status-badge">{student.roll_number}</span></td>
                        <td><strong>{student.student_name}</strong></td>
                        <td>{formatNumber(student.total_classes)}</td>
                        <td>{formatNumber(student.present)}</td>
                        <td>{formatNumber(student.absent)}</td>
                        <td>{formatNumber(student.late)}</td>
                        <td>{formatPercent(student.percentage)}</td>
                        <td>
                          <span className={`risk-badge${student.low_attendance ? ' risk' : ''}`}>
                            {student.low_attendance ? 'Risk' : 'Good'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-heading">
                <div>
                  <h2>Subject Summary</h2>
                  <p>Only your assigned subjects are included.</p>
                </div>
              </div>

              <div className="snapshot-list">
                {report.subject_summary.map((subject) => (
                  <div className="subject-report-row" key={subject.subject_id}>
                    <div>
                      <strong>{subject.subject}</strong>
                      <span>{subject.teacher_name}</span>
                    </div>
                    <div className="subject-report-metrics">
                      <span>{formatPercent(subject.percentage)}</span>
                      <small>{formatNumber(subject.absent)} absent</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}
