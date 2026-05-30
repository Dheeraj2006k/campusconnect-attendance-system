import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/axios';

const emptyForm = {
  name: '',
  academic_year: '',
  semester: '',
  start_date: '',
  end_date: '',
  is_active: false,
};

function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function AdminTerms() {
  const [terms, setTerms] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadTerms() {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/admin/terms');
      setTerms(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load academic terms.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTerms();
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(term) {
    setForm({
      name: term.name || '',
      academic_year: term.academic_year || '',
      semester: term.semester ? String(term.semester) : '',
      start_date: term.start_date ? String(term.start_date).slice(0, 10) : '',
      end_date: term.end_date ? String(term.end_date).slice(0, 10) : '',
      is_active: Boolean(term.is_active),
    });
    setEditingId(term.id);
    setMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      ...form,
      name: form.name.trim(),
      academic_year: form.academic_year.trim(),
      semester: Number(form.semester),
    };

    try {
      if (editingId) {
        await api.put(`/admin/terms/${editingId}`, payload);
        setMessage('Academic term updated successfully.');
      } else {
        await api.post('/admin/terms', payload);
        setMessage('Academic term created successfully.');
      }

      resetForm();
      await loadTerms();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save academic term.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Academic Terms"
      subtitle="Define semesters so attendance totals and previous-semester comparisons are exact."
    >
      <div className="management-layout">
        <section className="panel-card management-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? 'Edit Term' : 'Add Term'}</h2>
              <p>One active term is used by default for reports and new attendance.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="form-label" htmlFor="term-name">Name</label>
              <input
                id="term-name"
                className="form-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="2025-2026 Semester 5"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="term-year">Academic year</label>
              <input
                id="term-year"
                className="form-input"
                value={form.academic_year}
                onChange={(event) => updateField('academic_year', event.target.value)}
                placeholder="2025-2026"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="term-semester">Semester</label>
              <input
                id="term-semester"
                className="form-input"
                type="number"
                min="1"
                max="12"
                value={form.semester}
                onChange={(event) => updateField('semester', event.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="term-start">Start date</label>
              <input
                id="term-start"
                className="form-input"
                type="date"
                value={form.start_date}
                onChange={(event) => updateField('start_date', event.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="term-end">End date</label>
              <input
                id="term-end"
                className="form-input"
                type="date"
                value={form.end_date}
                onChange={(event) => updateField('end_date', event.target.value)}
                required
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => updateField('is_active', event.target.checked)}
              />
              <span>Set as active semester</span>
            </label>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Term' : 'Create Term'}
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
              <h2>Term Directory</h2>
              <p>{loading ? 'Loading terms...' : `${terms.length} semesters configured.`}</p>
            </div>
          </div>

          {message && <div className="inline-success">{message}</div>}
          {error && <div className="inline-alert">{error}</div>}

          {!loading && terms.length === 0 && (
            <div className="empty-state">
              <h3>No academic terms yet</h3>
              <p>Add the current semester before marking attendance.</p>
            </div>
          )}

          {terms.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Year</th>
                    <th>Sem</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((term) => (
                    <tr key={term.id}>
                      <td><strong>{term.name}</strong></td>
                      <td>{term.academic_year}</td>
                      <td>{term.semester}</td>
                      <td>{formatDate(term.start_date)} - {formatDate(term.end_date)}</td>
                      <td>
                        <span className={`risk-badge${term.is_active ? '' : ' neutral'}`}>
                          {term.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => startEdit(term)}>
                            Edit
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
