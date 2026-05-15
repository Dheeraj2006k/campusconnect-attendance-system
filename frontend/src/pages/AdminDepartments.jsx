import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = { name: '' };

export default function AdminDepartments() {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadDepartments() {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/admin/departments');
      setDepartments(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load departments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(department) {
    setForm({ name: department.name || '' });
    setEditingId(department.id);
    setMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (editingId) {
        await api.put(`/admin/departments/${editingId}`, form);
        setMessage('Department updated successfully.');
      } else {
        await api.post('/admin/departments', form);
        setMessage('Department created successfully.');
      }

      resetForm();
      await loadDepartments();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(department) {
    const confirmed = window.confirm(`Delete ${department.name}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/admin/departments/${department.id}`);
      setMessage('Department deleted successfully.');
      await loadDepartments();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete department.');
    }
  }

  return (
    <AppShell
      title="Departments"
      subtitle="Create and maintain academic departments used across Campus Connect."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Department' : 'Add Department'}</h2>
              <p>Use clear department names because they appear in dashboards and reports.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="department-name">
                Department name
              </label>
              <input
                id="department-name"
                className="form-input"
                value={form.name}
                onChange={(event) => setForm({ name: event.target.value })}
                placeholder="Computer Science Engineering"
                required
              />
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Department' : 'Create Department'}
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
              <h2>Department Directory</h2>
              <p>{loading ? 'Loading departments...' : `${departments.length} departments configured.`}</p>
            </div>
            <span className="panel-pill">Admin</span>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && departments.length === 0 && (
            <div className="empty-state">
              <h3>No departments yet</h3>
              <p>Add your first department to unlock classes and users.</p>
            </div>
          )}

          {departments.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Department</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.id}>
                      <td>{department.id}</td>
                      <td>
                        <strong>{department.name}</strong>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(department)}>
                            Edit
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => handleDelete(department)}
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
