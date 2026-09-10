import api from './api';
export async function getLessonContext(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/context`);
  return data.data.context;
}
export async function buildLessonContext(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/context/draft`);
  return data.data.context;
}
export async function saveLessonContext(lessonId, chunks) {
  const { data } = await api.put(`/lessons/${lessonId}/context/draft`, { chunks });
  return data.data.context;
}
export async function approveLessonContext(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/context/approve`);
  return data.data.context;
}
export async function reopenLessonContext(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/context/reopen`);
  return data.data.context;
}
