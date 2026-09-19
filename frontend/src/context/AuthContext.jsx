import { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/api';
import { clearStudentDashboardGreetingSession } from '../utils/dashboardGreeting';
import { instructorAccessCodeForStatus, isInstructorAccessCode, INSTRUCTOR_ACCESS_NOTICE_KEY } from '../utils/instructorAccess';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [validatingSession, setValidatingSession] = useState(() => Boolean(localStorage.getItem('token')));
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const login = useCallback(async (email, password, expectedRole) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password, expectedRole });
      const { user: u, token } = data.data;
      if (u.role === 'INSTRUCTOR' && u.status !== 'ACTIVE') {
        const denied = new Error('Your instructor account is not yet approved.');
        denied.code = instructorAccessCodeForStatus(u.status) || 'INSTRUCTOR_SUSPENDED';
        throw denied;
      }
      clearStudentDashboardGreetingSession(u.id);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
      setValidatingSession(false);
      return u;   // caller uses this to redirect by role
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Login failed.';
      const code = err.response?.data?.code || err.code;
      if (isInstructorAccessCode(code)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
      setError(msg);
      const failure = new Error(msg);
      failure.code = code;
      throw failure;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearStudentDashboardGreetingSession(user?.id);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setValidatingSession(false);
  }, [user?.id]);

  // Refresh user from /api/auth/me (called on app load to validate stored token)
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      localStorage.removeItem('user');
      setUser(null);
      setValidatingSession(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      const u = data.data.user;
      if (u.role === 'INSTRUCTOR' && u.status !== 'ACTIVE') {
        const code = instructorAccessCodeForStatus(u.status) || 'INSTRUCTOR_SUSPENDED';
        sessionStorage.setItem(INSTRUCTOR_ACCESS_NOTICE_KEY, code);
        throw new Error('Instructor approval required.');
      }
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
    } catch {
      // Token expired or invalid — clear everything
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setValidatingSession(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, validatingSession, loading, error, setError, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
