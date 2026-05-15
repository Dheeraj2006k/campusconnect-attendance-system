import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AdminClasses from './pages/AdminClasses';
import AdminDepartments from './pages/AdminDepartments';
import AdminHods from './pages/AdminHods';
import AdminStudents from './pages/AdminStudents';
import AdminSubjects from './pages/AdminSubjects';
import AdminTeachers from './pages/AdminTeachers';
import AdminTimetable from './pages/AdminTimetable';
import TeacherAttendance from './pages/TeacherAttendance';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherReports from './pages/TeacherReports';
import HodDashboard from './pages/HodDashboard';
import HodReports from './pages/HodReports';
import SmsLogs from './pages/SmsLogs';
import StudentDashboard from './pages/StudentDashboard';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminDepartments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/classes"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminClasses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/teachers"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminTeachers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminStudents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subjects"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminSubjects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/timetable"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminTimetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/hods"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminHods />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/sms"
            element={
              <ProtectedRoute roles={['admin']}>
                <SmsLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute roles={['admin']}>
                <HodReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod"
            element={
              <ProtectedRoute roles={['hod']}>
                <HodDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/reports"
            element={
              <ProtectedRoute roles={['hod']}>
                <HodReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hod/sms"
            element={
              <ProtectedRoute roles={['hod']}>
                <SmsLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher"
            element={
              <ProtectedRoute roles={['teacher']}>
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/attendance"
            element={
              <ProtectedRoute roles={['teacher']}>
                <TeacherAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/reports"
            element={
              <ProtectedRoute roles={['teacher']}>
                <TeacherReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute roles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
