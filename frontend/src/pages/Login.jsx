import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.token, res.data.user);

      const role = res.data.user.role;
      if (role === 'admin') navigate('/admin');
      else if (role === 'hod') navigate('/hod');
      else if (role === 'teacher') navigate('/teacher');
      else if (role === 'student') navigate('/student');
      else navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-stage">
      <section className="brand-intro" aria-hidden="true">
        <div className="brand-lockup">
          <h1 className="brand-title">Campus Connect</h1>
          <p className="brand-tagline">SMART ATTENDANCE INTELLIGENCE</p>
        </div>
      </section>

      <section className="login-view">
        <div className="login-copy">
          <p className="login-kicker">MGIT Attendance Platform</p>
          <h1 className="login-heading">Campus Connect</h1>
          <p className="login-subtitle">
            A real-time academic operations system for attendance, parent alerts,
            departmental oversight, and student progress visibility.
          </p>

          <div className="login-metrics" aria-label="Platform highlights">
            <div className="metric-tile">
              <span className="metric-value">4</span>
              <span className="metric-label">Role-aware portals</span>
            </div>
            <div className="metric-tile">
              <span className="metric-value">Live</span>
              <span className="metric-label">Attendance dashboard</span>
            </div>
            <div className="metric-tile">
              <span className="metric-value">75%</span>
              <span className="metric-label">Risk threshold alerts</span>
            </div>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-inner">
            <p className="panel-eyebrow">Secure access</p>
            <h2 className="panel-title">Sign in</h2>
            <p className="panel-subtitle">
              Use your campus account to open the right workspace.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label className="form-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@mgit.ac.in"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && <p className="form-error">{error}</p>}

              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p className="auth-footnote">
              JWT protected access for Admin, HOD, Teacher, and Student roles.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
