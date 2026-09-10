import api from './api';
export async function getLessonIntelligence(lessonId, config = {}) {
  const { data } = await api.get(`/lessons/${lessonId}/intelligence`, config);
  return data.data;
}
export async function generateLessonMaterials(lessonId, { signal } = {}) {
  const { data } = await api.post(`/lessons/${lessonId}/intelligence/materials`, undefined, {
    signal,
    timeout: 300000,
  });
  return data.data.materials;
}
export async function publishLessonMaterials(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/intelligence/materials/publish`);
  return data.data.materials;
}
export async function generateLessonQuiz(lessonId, options) {
  const { data } = await api.post(`/lessons/${lessonId}/intelligence/quiz`, options);
  return data.data.quiz;
}
export async function updateQuiz(quizId, payload) {
  const { data } = await api.put(`/quizzes/${quizId}`, payload);
  return data.data.quiz;
}
export async function updateQuizQuestion(quizId, questionId, payload) {
  const { data } = await api.put(`/quizzes/${quizId}/questions/${questionId}`, payload);
  return data.data.question;
}
export async function deleteQuizQuestion(quizId, questionId) {
  await api.delete(`/quizzes/${quizId}/questions/${questionId}`);
}
export async function publishQuiz(quizId) {
  const { data } = await api.post(`/quizzes/${quizId}/publish`);
  return data.data.quiz;
}
export async function closeQuiz(quizId) {
  const { data } = await api.post(`/quizzes/${quizId}/close`);
  return data.data.quiz;
}
export async function setQuizStatus(quizId, status) {
  const { data } = await api.patch(`/quizzes/${quizId}/status`, { status });
  return data.data.quiz;
}
export async function deleteQuiz(quizId, { force = false } = {}) {
  const { data } = await api.delete(`/quizzes/${quizId}`, { params: force ? { force: true } : undefined });
  return data.data.quiz;
}
