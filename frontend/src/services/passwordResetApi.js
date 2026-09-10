import api from './api';

export async function requestPasswordReset(email, role) {
  const { data } = await api.post('/auth/forgot-password', { email, role });
  return data.data;
}

export async function validatePasswordResetToken(token) {
  const { data } = await api.post('/auth/reset-password/validate', { token });
  return data.data;
}

export async function resetPassword(token, password) {
  const { data } = await api.post('/auth/reset-password', { token, password });
  return data.data;
}
