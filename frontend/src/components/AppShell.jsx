import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useAttendanceRealtime from '../hooks/useAttendanceRealtime';

const navItems = {
  admin: [
    ['Dashboard', '/admin', 'DB'],
    ['Departments', '/admin/departments', 'DP'],
    ['Students', '/admin/students', 'ST'],
    ['Teachers', '/admin/teachers', 'TC'],
    ['HODs', '/admin/hods', 'HD'],
    ['Classes', '/admin/classes', 'CL'],
    ['Terms', '/admin/terms', 'TM'],
    ['Subjects', '/admin/subjects', 'SB'],
    ['Timetable', '/admin/timetable', 'TT'],
    ['Reports', '/admin/reports', 'RP'],
    ['Notifications', '/admin/sms', 'NT'],
  ],
  hod: [
    ['Dashboard', '/hod', 'DB'],
    ['Reports', '/hod/reports', 'RP'],
    ['Notifications', '/hod/sms', 'NT'],
  ],
  teacher: [
    ['Dashboard', '/teacher', 'DB'],
    ['Mark Attendance', '/teacher/attendance', 'AT'],
    ['Reports', '/teacher/reports', 'RP'],
  ],
  student: [
    ['Dashboard', '/student', 'DB'],
  ],
};

function initials(name = 'User') {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function roleLabel(role) {
  if (role === 'hod') return 'HOD';
  return role || 'User';
}

export default function AppShell({ title, subtitle, children }) {
  const { user, logout } = useAuth();
  const items = navItems[user?.role] || [];
  const socketConnected = useAttendanceRealtime();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">CC</div>
          <div>
            <p className="sidebar-brand-name">Campus Connect</p>
            <p className="sidebar-brand-subtitle">Attendance Intelligence</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {items.map(([label, path, icon]) => (
            <NavLink
              key={path}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              to={path}
              end={path.split('/').length <= 2}
            >
              <span className="sidebar-icon">{icon}</span>
              <span className="sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{initials(user?.name)}</div>
            <div className="sidebar-user-details">
              <p className="sidebar-user-name">{user?.name}</p>
              <p className="sidebar-user-role">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button className="sidebar-logout" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <h1 className="topbar-title">{title}</h1>
            <p className="topbar-subtitle">{subtitle}</p>
          </div>
          <div className="topbar-controls">
            <div className="topbar-status">
              <span className={`status-dot${socketConnected ? '' : ' offline'}`} />
              {socketConnected ? 'Live system' : 'Offline mode'}
            </div>
            <button className="topbar-logout" type="button" onClick={logout} title="Logout">
              Logout
            </button>
          </div>
        </header>

        <section className="app-content">{children}</section>
      </main>
    </div>
  );
}
