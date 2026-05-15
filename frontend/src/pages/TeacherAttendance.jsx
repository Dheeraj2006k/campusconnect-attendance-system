import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const statuses = [
  { value: 'P', label: 'Present', tone: 'present' },
  { value: 'A', label: 'Absent', tone: 'absent' },
  { value: 'L', label: 'Late', tone: 'late' },
];

function todayInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function countStatuses(records) {
  return records.reduce(
    (counts, record) => ({
      ...counts,
      [record.status]: (counts[record.status] || 0) + 1,
    }),
    { P: 0, A: 0, L: 0 }
  );
}

export default function TeacherAttendance() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [existingRecords, setExistingRecords] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [date, setDate] = useState(todayInputValue());
  const [periodNo, setPeriodNo] = useState('1');
  const [statusByStudent, setStatusByStudent] = useState({});
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const classOptions = useMemo(
    () => classes.map((item) => ({
      value: String(item.id),
      label: `${item.name} ${item.section}`,
    })),
    [classes]
  );

  const subjectsForClass = useMemo(
    () => subjects.filter((subject) => String(subject.class_id) === String(selectedClassId)),
    [selectedClassId, subjects]
  );

  const existingByStudent = useMemo(() => {
    const map = new Map();
    existingRecords.forEach((record) => map.set(Number(record.student_id), record));
    return map;
  }, [existingRecords]);

  const hasExistingAttendance = existingRecords.length > 0;
  const counts = countStatuses(students.map((student) => ({
    status: statusByStudent[student.id] || 'P',
  })));

  async function loadSetupData() {
    try {
      setLoading(true);
      setError('');
      const [classRes, subjectRes] = await Promise.all([
        api.get('/admin/classes'),
        api.get('/admin/subjects'),
      ]);

      const loadedClasses = classRes.data || [];
      const loadedSubjects = subjectRes.data || [];
      const firstClassId = loadedClasses[0]?.id ? String(loadedClasses[0].id) : '';
      const firstSubject = loadedSubjects.find((subject) => String(subject.class_id) === firstClassId);

      setClasses(loadedClasses);
      setSubjects(loadedSubjects);
      setSelectedClassId(firstClassId);
      setSelectedSubjectId(firstSubject?.id ? String(firstSubject.id) : '');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load teacher assignments.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRosterAndAttendance() {
    if (!selectedClassId || !selectedSubjectId || !date || !periodNo) {
      setStudents([]);
      setExistingRecords([]);
      setStatusByStudent({});
      return;
    }

    try {
      setRosterLoading(true);
      setError('');

      const [studentRes, attendanceRes] = await Promise.all([
        api.get('/admin/students', { params: { class_id: selectedClassId } }),
        api.get('/attendance', {
          params: {
            subject_id: selectedSubjectId,
            date,
            period_no: periodNo,
          },
        }),
      ]);

      const loadedStudents = studentRes.data || [];
      const loadedRecords = attendanceRes.data || [];
      const statusMap = {};

      loadedStudents.forEach((student) => {
        statusMap[student.id] = 'P';
      });

      loadedRecords.forEach((record) => {
        statusMap[record.student_id] = record.status;
      });

      setStudents(loadedStudents);
      setExistingRecords(loadedRecords);
      setStatusByStudent(statusMap);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load attendance roster.');
    } finally {
      setRosterLoading(false);
    }
  }

  useEffect(() => {
    loadSetupData();
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    const firstSubject = subjects.find((subject) => String(subject.class_id) === String(selectedClassId));
    setSelectedSubjectId(firstSubject?.id ? String(firstSubject.id) : '');
  }, [selectedClassId, subjects]);

  useEffect(() => {
    loadRosterAndAttendance();
  }, [selectedClassId, selectedSubjectId, date, periodNo]);

  function setStudentStatus(studentId, status) {
    setStatusByStudent((current) => ({ ...current, [studentId]: status }));
  }

  function markAll(status) {
    const next = {};
    students.forEach((student) => {
      next[student.id] = status;
    });
    setStatusByStudent(next);
  }

  async function submitAttendance(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (hasExistingAttendance) {
        const changedRecords = existingRecords.filter(
          (record) => statusByStudent[record.student_id] && statusByStudent[record.student_id] !== record.status
        );

        const lockedChanged = changedRecords.find((record) => !record.teacher_editable);
        if (lockedChanged) {
          setError('One or more changed records are outside the 30-minute edit window.');
          return;
        }

        await Promise.all(
          changedRecords.map((record) => api.patch(`/attendance/${record.id}`, {
            status: statusByStudent[record.student_id],
          }))
        );

        setMessage(changedRecords.length === 0 ? 'No attendance changes to save.' : 'Attendance updates saved.');
      } else {
        const records = students.map((student) => ({
          student_id: student.id,
          status: statusByStudent[student.id] || 'P',
        }));

        const res = await api.post('/attendance/mark', {
          subject_id: Number(selectedSubjectId),
          date,
          period_no: Number(periodNo),
          records,
        });

        setMessage(`${res.data.message}. SMS queued: ${res.data.sms_queued || 0}.`);
      }

      await loadRosterAndAttendance();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Mark Attendance"
      subtitle="Select a class session, mark each student, and submit attendance securely."
    >
      <form className="attendance-workspace" onSubmit={submitAttendance}>
        <section className="panel-card attendance-controls">
          <div className="panel-heading">
            <div>
              <h2>Session</h2>
              <p>Attendance is unique per subject, date, and period.</p>
            </div>
            <span className="panel-pill">{hasExistingAttendance ? 'Edit mode' : 'New session'}</span>
          </div>

          <div className="control-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="attendance-class">Class</label>
              <select
                id="attendance-class"
                className="form-input"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                required
              >
                <option value="">Select class</option>
                {classOptions.map((item) => (
                  <option value={item.value} key={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="attendance-subject">Subject</label>
              <select
                id="attendance-subject"
                className="form-input"
                value={selectedSubjectId}
                onChange={(event) => setSelectedSubjectId(event.target.value)}
                required
              >
                <option value="">Select subject</option>
                {subjectsForClass.map((subject) => (
                  <option value={subject.id} key={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="attendance-date">Date</label>
              <input
                id="attendance-date"
                className="form-input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="attendance-period">Period</label>
              <select
                id="attendance-period"
                className="form-input"
                value={periodNo}
                onChange={(event) => setPeriodNo(event.target.value)}
                required
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((period) => (
                  <option value={period} key={period}>Period {period}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="page-grid attendance-summary-grid">
          <div className="stat-card stat-card-success">
            <p className="stat-label">Present</p>
            <p className="stat-value">{counts.P}</p>
            <p className="stat-note">Marked P</p>
          </div>
          <div className="stat-card stat-card-danger">
            <p className="stat-label">Absent</p>
            <p className="stat-value">{counts.A}</p>
            <p className="stat-note">SMS will queue</p>
          </div>
          <div className="stat-card stat-card-warning">
            <p className="stat-label">Late</p>
            <p className="stat-value">{counts.L}</p>
            <p className="stat-note">Marked L</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Students</p>
            <p className="stat-value">{students.length}</p>
            <p className="stat-note">Loaded roster</p>
          </div>
        </section>

        <section className="panel-card attendance-roster-panel">
          <div className="panel-heading">
            <div>
              <h2>Student Roster</h2>
              <p>{rosterLoading || loading ? 'Loading roster...' : `${students.length} students ready.`}</p>
            </div>
            <div className="bulk-actions">
              <button type="button" onClick={() => markAll('P')} disabled={students.length === 0 || hasExistingAttendance}>
                All Present
              </button>
              <button type="button" onClick={() => markAll('A')} disabled={students.length === 0 || hasExistingAttendance}>
                All Absent
              </button>
            </div>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && !rosterLoading && (!selectedClassId || !selectedSubjectId) && (
            <div className="empty-state">
              <h3>Select a class and subject</h3>
              <p>Your assigned subjects will appear once class setup is complete.</p>
            </div>
          )}

          {!loading && !rosterLoading && selectedSubjectId && students.length === 0 && (
            <div className="empty-state">
              <h3>No students found</h3>
              <p>This class has no student records yet.</p>
            </div>
          )}

          {students.length > 0 && (
            <div className="attendance-roster">
              {students.map((student) => {
                const existing = existingByStudent.get(Number(student.id));
                const locked = Boolean(existing && !existing.teacher_editable);

                return (
                  <article className={`roster-row${locked ? ' locked' : ''}`} key={student.id}>
                    <div className="roster-student">
                      <span className="status-badge">{student.roll_number}</span>
                      <div>
                        <h3>{student.name}</h3>
                        <p>{student.email}</p>
                      </div>
                    </div>

                    <div className="status-toggle" aria-label={`Attendance status for ${student.name}`}>
                      {statuses.map((status) => (
                        <button
                          className={`status-option ${status.tone}${statusByStudent[student.id] === status.value ? ' active' : ''}`}
                          type="button"
                          key={status.value}
                          disabled={locked}
                          onClick={() => setStudentStatus(student.id, status.value)}
                        >
                          <span>{status.value}</span>
                          {status.label}
                        </button>
                      ))}
                    </div>

                    <span className={`edit-window-badge${locked ? ' locked' : ''}`}>
                      {existing ? (locked ? 'Locked' : 'Editable') : 'New'}
                    </span>
                  </article>
                );
              })}
            </div>
          )}

          <div className="submit-bar">
            <p>
              {hasExistingAttendance
                ? 'Existing attendance can be edited only within the teacher edit window.'
                : 'Review the roster before submitting. Duplicate sessions are blocked by the backend.'}
            </p>
            <button className="primary-button" type="submit" disabled={saving || students.length === 0}>
              {saving ? 'Saving...' : hasExistingAttendance ? 'Save Changes' : 'Submit Attendance'}
            </button>
          </div>
        </section>
      </form>
    </AppShell>
  );
}
