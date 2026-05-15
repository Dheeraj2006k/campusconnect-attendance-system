import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  department_id: '',
};

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ value: String(department.id), label: department.name })),
    [departments]
  );

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const [teacherRes, departmentRes] = await Promise.all([
        api.get('/admin/teachers'),
        api.get('/admin/departments'),
      ]);
      setTeachers(teacherRes.data || []);
      setDepartments(departmentRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load teacher data.');
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

  function startEdit(teacher) {
    setForm({
      name: teacher.name || '',
      email: teacher.email || '',
      password: '',
      department_id: teacher.department_id ? String(teacher.department_id) : '',
    });
    setEditingId(teacher.id);
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
      department_id: form.department_id ? Number(form.department_id) : null,
    };

    if (form.password) payload.password = form.password;

    try {
      if (editingId) {
        await api.put(`/admin/teachers/${editingId}`, payload);
        setMessage('Teacher updated successfully.');
      } else {
        await api.post('/admin/teachers', payload);
        setMessage('Teacher created successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save teacher.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(teacher) {
    const confirmed = window.confirm(`Delete ${teacher.name}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/admin/teachers/${teacher.id}`);
      setMessage('Teacher deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete teacher.');
    }
  }

  return (
    <AppShell
      title="Teachers"
      subtitle="Manage faculty accounts and connect teachers to their departments."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Teacher' : 'Add Teacher'}</h2>
              <p>Teachers can later be assigned subjects and mark attendance for those classes.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="teacher-name">
                Full name
              </label>
              <input
                id="teacher-name"
                className="form-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Dr. Anitha Rao"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="teacher-email">
                Email
              </label>
              <input
                id="teacher-email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="teacher@mgit.ac.in"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="teacher-password">
                Password {editingId ? '(leave blank to keep current)' : ''}
              </label>
              <input
                id="teacher-password"
                className="form-input"
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder={editingId ? 'No password change' : 'Temporary password'}
                required={!editingId}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="teacher-department">
                Department
              </label>
              <select
                id="teacher-department"
                className="form-input"
                value={form.department_id}
                onChange={(event) => updateField('department_id', event.target.value)}
              >
                <option value="">Unassigned</option>
                {departmentOptions.map((department) => (
                  <option value={department.value} key={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Teacher' : 'Create Teacher'}
              </button>
              {editingId && (
                <button className="secondary-button" type="button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel-card management-table-panel">
          <div className="panel-heading">
            <div>
              <h2>Teacher Directory</h2>
              <p>{loading ? 'Loading teachers...' : `${teachers.length} teachers configured.`}</p>
            </div>
            <span className="panel-pill">Faculty</span>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && teachers.length === 0 && (
            <div className="empty-state">
              <h3>No teachers yet</h3>
              <p>Add faculty accounts before creating subject assignments.</p>
            </div>
          )}

          {teachers.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Teacher</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td>{teacher.id}</td>
                      <td>
                        <strong>{teacher.name}</strong>
                      </td>
                      <td>{teacher.email}</td>
                      <td>{teacher.department || 'Unassigned'}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(teacher)}>
                            Edit
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => handleDelete(teacher)}
                          >
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
