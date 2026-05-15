import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = {
  name: '',
  class_id: '',
  teacher_id: '',
};

export default function AdminSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
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

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const [subjectRes, classRes, teacherRes] = await Promise.all([
        api.get('/admin/subjects'),
        api.get('/admin/classes'),
        api.get('/admin/teachers'),
      ]);
      setSubjects(subjectRes.data || []);
      setClasses(classRes.data || []);
      setTeachers(teacherRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load subject data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(subject) {
    setForm({
      name: subject.name || '',
      class_id: subject.class_id ? String(subject.class_id) : '',
      teacher_id: subject.teacher_id ? String(subject.teacher_id) : '',
    });
    setEditingId(subject.id);
    setMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      name: form.name.trim(),
      class_id: Number(form.class_id),
      teacher_id: Number(form.teacher_id),
    };

    try {
      if (editingId) {
        await api.put(`/admin/subjects/${editingId}`, payload);
        setMessage('Subject updated successfully.');
      } else {
        await api.post('/admin/subjects', payload);
        setMessage('Subject created successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save subject.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(subject) {
    const confirmed = window.confirm(`Delete ${subject.name}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/admin/subjects/${subject.id}`);
      setMessage('Subject deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete subject.');
    }
  }

  return (
    <AppShell
      title="Subjects"
      subtitle="Assign subjects to classes and teachers for attendance workflows."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Subject' : 'Add Subject'}</h2>
              <p>Subjects connect faculty, classes, timetable periods, and attendance reports.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="subject-name">Subject name</label>
              <input
                id="subject-name"
                className="form-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Database Management Systems"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="subject-class">Class</label>
              <select
                id="subject-class"
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
              <label className="form-label" htmlFor="subject-teacher">Teacher</label>
              <select
                id="subject-teacher"
                className="form-input"
                value={form.teacher_id}
                onChange={(event) => updateField('teacher_id', event.target.value)}
                required
              >
                <option value="">Select teacher</option>
                {teachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name} {teacher.department ? `- ${teacher.department}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving || classes.length === 0 || teachers.length === 0}
              >
                {saving ? 'Saving...' : editingId ? 'Update Subject' : 'Create Subject'}
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
              <h2>Subject Directory</h2>
              <p>{loading ? 'Loading subjects...' : `${subjects.length} subjects configured.`}</p>
            </div>
            <span className="panel-pill">Academic map</span>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && (classes.length === 0 || teachers.length === 0) && (
            <div className="empty-state">
              <h3>Finish class and teacher setup first</h3>
              <p>Subjects require both a class and a teacher assignment.</p>
            </div>
          )}

          {!loading && classes.length > 0 && teachers.length > 0 && subjects.length === 0 && (
            <div className="empty-state">
              <h3>No subjects yet</h3>
              <p>Add subjects to unlock timetable and attendance marking.</p>
            </div>
          )}

          {subjects.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subject</th>
                    <th>Class</th>
                    <th>Teacher</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => (
                    <tr key={subject.id}>
                      <td>{subject.id}</td>
                      <td><strong>{subject.name}</strong></td>
                      <td>{subject.class_name} {subject.section}</td>
                      <td>{subject.teacher_name}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(subject)}>Edit</button>
                          <button className="danger-action" type="button" onClick={() => handleDelete(subject)}>
                            Delete
                          </button>
                        </div>
                      </td>
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
