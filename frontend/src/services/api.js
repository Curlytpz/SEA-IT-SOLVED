import axios from 'axios';
import { INSTRUCTOR_ACCESS_NOTICE_KEY, isInstructorAccessCode } from '../utils/instructorAccess';

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

// Expired tokens and server-revoked instructor access both end the local session.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const requestUrl = String(err.config?.url || '');
    const isLoginRequest = /(?:^|\/)auth\/login(?:\?|$)/.test(requestUrl);
    const accessCode = err.response?.data?.code;
    const instructorAccessDenied = err.response?.status === 403 && isInstructorAccessCode(accessCode);
    if (!isLoginRequest && (err.response?.status === 401 || instructorAccessDenied)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (instructorAccessDenied) sessionStorage.setItem(INSTRUCTOR_ACCESS_NOTICE_KEY, accessCode);
      window.location.replace(instructorAccessDenied ? '/login?role=instructor' : '/login');
    }
    return Promise.reject(err);
  }
);

export default api;
