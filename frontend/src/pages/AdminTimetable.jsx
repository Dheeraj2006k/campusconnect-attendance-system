import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const periods = [1, 2, 3, 4, 5, 6, 7, 8];

const emptyForm = {
  class_id: '',
  subject_id: '',
  day_of_week: 'Monday',
  period_no: '1',
};

export default function AdminTimetable() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const classOptions = useMemo(
    () => classes.map((item) => ({
      value: String(item.id),
      label: `${item.name} ${item.section} - ${item.department}`,
    })),
    [classes]
  );

  const filteredSubjects = useMemo(
    () => subjects.filter((subject) => String(subject.class_id) === String(form.class_id || selectedClassId)),
    [form.class_id, selectedClassId, subjects]
  );

  async function loadSetupData() {
    try {
      setLoading(true);
      setError('');
      const [classRes, subjectRes] = await Promise.all([
        api.get('/admin/classes'),
        api.get('/admin/subjects'),
      ]);

      const loadedClasses = classRes.data || [];
      setClasses(loadedClasses);
      setSubjects(subjectRes.data || []);

      if (loadedClasses.length > 0) {
        const firstClassId = String(loadedClasses[0].id);
        setSelectedClassId((current) => current || firstClassId);
        setForm((current) => ({ ...current, class_id: current.class_id || firstClassId }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load timetable setup data.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTimetable(classId) {
    if (!classId) {
      setSlots([]);
      return;
    }

    try {
      setError('');
      const res = await api.get('/timetable', { params: { class_id: classId } });
      setSlots(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load timetable.');
    }
  }

  useEffect(() => {
    loadSetupData();
  }, []);

  useEffect(() => {
    loadTimetable(selectedClassId);
  }, [selectedClassId]);

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'class_id') next.subject_id = '';
      return next;
    });
  }

  function handleClassFilter(value) {
    setSelectedClassId(value);
    setForm((current) => ({ ...current, class_id: value, subject_id: '' }));
    setEditingId(null);
    setMessage('');
    setError('');
  }

  function resetForm(classId = selectedClassId) {
    setForm({ ...emptyForm, class_id: classId || '' });
    setEditingId(null);
  }

  function startEdit(slot) {
    setForm({
      class_id: String(slot.class_id || selectedClassId),
      subject_id: slot.subject_id ? String(slot.subject_id) : '',
      day_of_week: slot.day_of_week || 'Monday',
      period_no: String(slot.period_no || 1),
    });
    setEditingId(slot.id);
    setMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      class_id: Number(form.class_id),
      subject_id: Number(form.subject_id),
      day_of_week: form.day_of_week,
      period_no: Number(form.period_no),
    };

    try {
      if (editingId) {
        await api.put(`/timetable/${editingId}`, payload);
        setMessage('Timetable slot updated successfully.');
      } else {
        await api.post('/timetable', payload);
        setMessage('Timetable slot created successfully.');
      }

      const savedClassId = String(payload.class_id);
      setSelectedClassId(savedClassId);
      resetForm(savedClassId);
      await loadTimetable(payload.class_id);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save timetable slot.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slot) {
    const confirmed = window.confirm(`Delete ${slot.day_of_week} period ${slot.period_no}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/timetable/${slot.id}`);
      setMessage('Timetable slot deleted successfully.');
      await loadTimetable(selectedClassId);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete timetable slot.');
    }
  }

  function slotFor(day, period) {
    return slots.find((slot) => slot.day_of_week === day && Number(slot.period_no) === period);
  }

  return (
    <AppShell
      title="Timetable"
      subtitle="Build weekly class schedules used by attendance and dashboard workflows."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Slot' : 'Add Slot'}</h2>
              <p>Choose a class, subject, day, and period for the weekly schedule.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="timetable-class">Class</label>
              <select
                id="timetable-class"
                className="form-input"
                value={form.class_id}
                onChange={(event) => updateField('class_id', event.target.value)}
                required
              >
                <option value="">Select class</option>
                {classOptions.map((item) => (
                  <option value={item.value} key={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="timetable-subject">Subject</label>
              <select
                id="timetable-subject"
                className="form-input"
                value={form.subject_id}
                onChange={(event) => updateField('subject_id', event.target.value)}
                required
              >
                <option value="">Select subject</option>
                {filteredSubjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>
                    {subject.name} - {subject.teacher_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="timetable-day">Day</label>
              <select
                id="timetable-day"
                className="form-input"
                value={form.day_of_week}
                onChange={(event) => updateField('day_of_week', event.target.value)}
                required
              >
                {days.map((day) => (
                  <option value={day} key={day}>{day}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="timetable-period">Period</label>
              <select
                id="timetable-period"
                className="form-input"
                value={form.period_no}
                onChange={(event) => updateField('period_no', event.target.value)}
                required
              >
                {periods.map((period) => (
                  <option value={period} key={period}>Period {period}</option>
                ))}
              </select>
            </div>

            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving || classes.length === 0 || filteredSubjects.length === 0}
              >
                {saving ? 'Saving...' : editingId ? 'Update Slot' : 'Create Slot'}
              </button>
              {editingId && (
                <button className="secondary-button" type="button" onClick={resetForm}>Cancel</button>
              )}
            </div>
          </form>
        </section>

        <section className="panel-card management-table-panel">
          <div className="panel-heading">
            <div>
              <h2>Weekly Schedule</h2>
              <p>{loading ? 'Loading timetable setup...' : `${slots.length} slots configured for selected class.`}</p>
            </div>
            <span className="panel-pill">Periods 1-8</span>
          </div>

          <div className="form-field compact-filter">
            <label className="form-label" htmlFor="timetable-class-filter">View class</label>
            <select
              id="timetable-class-filter"
              className="form-input"
              value={selectedClassId}
              onChange={(event) => handleClassFilter(event.target.value)}
            >
              <option value="">Select class</option>
              {classOptions.map((item) => (
                <option value={item.value} key={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && classes.length === 0 && (
            <div className="empty-state">
              <h3>Create a class first</h3>
              <p>Timetable slots require class and subject setup.</p>
            </div>
          )}

          {!loading && classes.length > 0 && subjects.length === 0 && (
            <div className="empty-state">
              <h3>Create subjects first</h3>
              <p>Timetable slots require subjects assigned to classes.</p>
            </div>
          )}

          {selectedClassId && (
            <div className="timetable-grid-wrap">
              <table className="timetable-grid">
                <thead>
                  <tr>
                    <th>Day</th>
                    {periods.map((period) => (
                      <th key={period}>P{period}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day}>
                      <th>{day}</th>
                      {periods.map((period) => {
                        const slot = slotFor(day, period);
                        return (
                          <td key={`${day}-${period}`}>
                            {slot ? (
                              <div className="timetable-slot">
                                <strong>{slot.subject}</strong>
                                <span>{slot.teacher}</span>
                                <div className="table-actions">
                                  <button type="button" onClick={() => startEdit(slot)}>Edit</button>
                                  <button
                                    className="danger-action"
                                    type="button"
                                    onClick={() => handleDelete(slot)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="empty-slot">Free</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
