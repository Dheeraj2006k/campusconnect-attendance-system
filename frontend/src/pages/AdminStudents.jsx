import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  roll_number: '',
  parent_phone: '',
  parent_email: '',
  class_id: '',
};

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
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
      const [studentRes, classRes] = await Promise.all([
        api.get('/admin/students'),
        api.get('/admin/classes'),
      ]);
      setStudents(studentRes.data || []);
      setClasses(classRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load student data.');
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

  function startEdit(student) {
    setForm({
      name: student.name || '',
      email: student.email || '',
      password: '',
      roll_number: student.roll_number || '',
      parent_phone: student.parent_phone || '',
      parent_email: student.parent_email || '',
      class_id: student.class_id ? String(student.class_id) : '',
    });
    setEditingId(student.id);
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
      email: form.email.trim(),
      roll_number: form.roll_number.trim(),
      parent_phone: form.parent_phone.trim(),
      parent_email: form.parent_email.trim(),
      class_id: Number(form.class_id),
    };

    if (form.password) payload.password = form.password;

    try {
      if (editingId) {
        await api.put(`/admin/students/${editingId}`, payload);
        setMessage('Student updated successfully.');
      } else {
        await api.post('/admin/students', payload);
        setMessage('Student created successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save student.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(student) {
    const confirmed = window.confirm(`Delete ${student.name}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/admin/students/${student.id}`);
      setMessage('Student deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete student.');
    }
  }

  return (
    <AppShell
      title="Students"
      subtitle="Maintain student accounts, roll numbers, guardian contacts, and class placement."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Student' : 'Add Student'}</h2>
              <p>Student records drive attendance marking, reports, and parent alerts.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="student-name">Full name</label>
              <input
                id="student-name"
                className="form-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Student name"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="student-email">Email</label>
              <input
                id="student-email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="student@mgit.ac.in"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="student-password">
                Password {editingId ? '(leave blank to keep current)' : ''}
              </label>
              <input
                id="student-password"
                className="form-input"
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder={editingId ? 'No password change' : 'Temporary password'}
                required={!editingId}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="student-roll">Roll number</label>
              <input
                id="student-roll"
                className="form-input"
                value={form.roll_number}
                onChange={(event) => updateField('roll_number', event.target.value)}
                placeholder="22CSE001"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="student-phone">Parent phone</label>
              <input
                id="student-phone"
                className="form-input"
                value={form.parent_phone}
                onChange={(event) => updateField('parent_phone', event.target.value)}
                placeholder="9876543210"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="student-parent-email">Parent email</label>
              <input
                id="student-parent-email"
                className="form-input"
                type="email"
                value={form.parent_email}
                onChange={(event) => updateField('parent_email', event.target.value)}
                placeholder="parent@example.com"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="student-class">Class</label>
              <select
                id="student-class"
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

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving || classes.length === 0}>
                {saving ? 'Saving...' : editingId ? 'Update Student' : 'Create Student'}
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
              <h2>Student Directory</h2>
              <p>{loading ? 'Loading students...' : `${students.length} students configured.`}</p>
            </div>
            <span className="panel-pill">Learners</span>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && classes.length === 0 && (
            <div className="empty-state">
              <h3>Create a class first</h3>
              <p>Students need a class assignment before they can be added.</p>
            </div>
          )}

          {!loading && classes.length > 0 && students.length === 0 && (
            <div className="empty-state">
              <h3>No students yet</h3>
              <p>Add student profiles to begin attendance tracking.</p>
            </div>
          )}

          {students.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Roll No.</th>
                    <th>Student</th>
                    <th>Email</th>
                    <th>Class</th>
                    <th>Parent Phone</th>
                    <th>Parent Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td><span className="status-badge">{student.roll_number}</span></td>
                      <td><strong>{student.name}</strong></td>
                      <td>{student.email}</td>
                      <td>{student.class_name} {student.section}</td>
                      <td>{student.parent_phone}</td>
                      <td>{student.parent_email}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(student)}>Edit</button>
                          <button className="danger-action" type="button" onClick={() => handleDelete(student)}>
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
