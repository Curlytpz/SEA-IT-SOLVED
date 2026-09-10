import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Automatically attach the JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear auth state so the user is redirected to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const requestUrl = String(err.config?.url || '');
    const isLoginRequest = /(?:^|\/)auth\/login(?:\?|$)/.test(requestUrl);
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Let the app's ProtectedRoute redirect to /login
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
