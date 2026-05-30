import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = {
  name: '',
  section: '',
  department_id: '',
  attendance_threshold: '75',
};

export default function AdminClasses() {
  const [classes, setClasses] = useState([]);
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
      const [classRes, departmentRes] = await Promise.all([
        api.get('/admin/classes'),
        api.get('/admin/departments'),
      ]);
      setClasses(classRes.data || []);
      setDepartments(departmentRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load class data.');
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

  function startEdit(classItem) {
    setForm({
      name: classItem.name || '',
      section: classItem.section || '',
      department_id: classItem.department_id ? String(classItem.department_id) : '',
      attendance_threshold: classItem.attendance_threshold ? String(classItem.attendance_threshold) : '75',
    });
    setEditingId(classItem.id);
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
      section: form.section.trim().toUpperCase(),
      department_id: Number(form.department_id),
      attendance_threshold: Number(form.attendance_threshold || 75),
    };

    try {
      if (editingId) {
        await api.put(`/admin/classes/${editingId}`, payload);
        setMessage('Class updated successfully.');
      } else {
        await api.post('/admin/classes', payload);
        setMessage('Class created successfully.');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save class.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(classItem) {
    const confirmed = window.confirm(`Delete ${classItem.name} ${classItem.section}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await api.delete(`/admin/classes/${classItem.id}`);
      setMessage('Class deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete class.');
    }
  }

  return (
    <AppShell
      title="Classes"
      subtitle="Manage class sections and connect them to the correct department."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Class' : 'Add Class'}</h2>
              <p>Classes become the base for students, subjects, timetables, and reports.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="class-name">
                Class name
              </label>
              <input
                id="class-name"
                className="form-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="CSE 3rd Year"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="class-section">
                Section
              </label>
              <input
                id="class-section"
                className="form-input"
                value={form.section}
                onChange={(event) => updateField('section', event.target.value)}
                placeholder="A"
                maxLength={10}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="class-department">
                Department
              </label>
              <select
                id="class-department"
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

            <div className="form-field">
              <label className="form-label" htmlFor="class-threshold">
                Attendance threshold %
              </label>
              <input
                id="class-threshold"
                className="form-input"
                type="number"
                min="1"
                max="99"
                step="0.01"
                value={form.attendance_threshold}
                onChange={(event) => updateField('attendance_threshold', event.target.value)}
                required
              />
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving || departments.length === 0}>
                {saving ? 'Saving...' : editingId ? 'Update Class' : 'Create Class'}
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
              <h2>Class Directory</h2>
              <p>{loading ? 'Loading classes...' : `${classes.length} classes configured.`}</p>
            </div>
            <span className="panel-pill">Admin</span>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && departments.length === 0 && (
            <div className="empty-state">
              <h3>Create a department first</h3>
              <p>Classes need a department before they can be added.</p>
            </div>
          )}

          {!loading && departments.length > 0 && classes.length === 0 && (
            <div className="empty-state">
              <h3>No classes yet</h3>
              <p>Add your first class section to continue setup.</p>
            </div>
          )}

          {classes.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Class</th>
                    <th>Section</th>
                    <th>Department</th>
                    <th>Threshold</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classItem) => (
                    <tr key={classItem.id}>
                      <td>{classItem.id}</td>
                      <td>
                        <strong>{classItem.name}</strong>
                      </td>
                      <td>
                        <span className="status-badge">{classItem.section}</span>
                      </td>
                      <td>{classItem.department}</td>
                      <td>{Number(classItem.attendance_threshold || 75).toFixed(2)}%</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(classItem)}>
                            Edit
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => handleDelete(classItem)}
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
