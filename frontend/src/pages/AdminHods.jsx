import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  department_id: '',
};

export default function AdminHods() {
  const [hods, setHods] = useState([]);
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
      const [hodRes, departmentRes] = await Promise.all([
        api.get('/admin/hods'),
        api.get('/admin/departments'),
      ]);
      setHods(hodRes.data || []);
      setDepartments(departmentRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load HOD data.');
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

  function startEdit(hod) {
    setForm({
      name: hod.name || '',
      email: hod.email || '',
      password: '',
      department_id: hod.department_id ? String(hod.department_id) : '',
    });
    setEditingId(hod.id);
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
      department_id: Number(form.department_id),
    };

    if (form.password) payload.password = form.password;

    try {
      if (editingId) {
        await api.put(`/admin/hods/${editingId}`, payload);
        setMessage('HOD updated successfully.');
      } else {
        await api.post('/admin/hods', payload);
        setMessage('HOD created successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save HOD.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(hod) {
    const confirmed = window.confirm(`Delete ${hod.name}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/admin/hods/${hod.id}`);
      setMessage('HOD deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete HOD.');
    }
  }

  return (
    <AppShell
      title="HODs"
      subtitle="Assign department-level leadership access for controlled oversight."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit HOD' : 'Add HOD'}</h2>
              <p>Each HOD must be connected to a department for scoped dashboard access.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="hod-name">
                Full name
              </label>
              <input
                id="hod-name"
                className="form-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Prof. Suresh Kumar"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="hod-email">
                Email
              </label>
              <input
                id="hod-email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="hod@mgit.ac.in"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="hod-password">
                Password {editingId ? '(leave blank to keep current)' : ''}
              </label>
              <input
                id="hod-password"
                className="form-input"
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder={editingId ? 'No password change' : 'Temporary password'}
                required={!editingId}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="hod-department">
                Department
              </label>
              <select
                id="hod-department"
                className="form-input"
                value={form.department_id}
                onChange={(event) => updateField('department_id', event.target.value)}
                required
              >
                <option value="">Select department</option>
                {departmentOptions.map((department) => (
                  <option value={department.value} key={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving || departments.length === 0}>
                {saving ? 'Saving...' : editingId ? 'Update HOD' : 'Create HOD'}
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
              <h2>HOD Directory</h2>
              <p>{loading ? 'Loading HODs...' : `${hods.length} HOD accounts configured.`}</p>
            </div>
            <span className="panel-pill">Department access</span>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && departments.length === 0 && (
            <div className="empty-state">
              <h3>Create a department first</h3>
              <p>HOD accounts need department assignment for scoped access.</p>
            </div>
          )}

          {!loading && departments.length > 0 && hods.length === 0 && (
            <div className="empty-state">
              <h3>No HODs yet</h3>
              <p>Add HOD accounts after departments are ready.</p>
            </div>
          )}

          {hods.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>HOD</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hods.map((hod) => (
                    <tr key={hod.id}>
                      <td>{hod.id}</td>
                      <td>
                        <strong>{hod.name}</strong>
                      </td>
                      <td>{hod.email}</td>
                      <td>{hod.department}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(hod)}>
                            Edit
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => handleDelete(hod)}
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
