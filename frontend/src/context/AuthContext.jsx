import { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/api';
import { clearStudentDashboardGreetingSession } from '../utils/dashboardGreeting';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) || null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const login = useCallback(async (email, password, expectedRole) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password, expectedRole });
      const { user: u, token } = data.data;
      clearStudentDashboardGreetingSession(u.id);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
      return u;   // caller uses this to redirect by role
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearStudentDashboardGreetingSession(user?.id);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, [user?.id]);

  // Refresh user from /api/auth/me (called on app load to validate stored token)
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const { data } = await api.get('/auth/me');
      const u = data.data.user;
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
    } catch {
      // Token expired or invalid — clear everything
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, setError, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
