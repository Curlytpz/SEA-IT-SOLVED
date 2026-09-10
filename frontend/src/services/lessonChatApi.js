import api from './api';

export async function getLessonChat(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/chat`);
  return data.data;
}

export async function sendLessonChatMessage(lessonId, payload) {
  const body = typeof payload === 'string' ? { message: payload } : payload;
  const { data } = await api.post(`/lessons/${lessonId}/chat/messages`, body);
  return data.data;
}

export async function generateQuizFromLessonChat(lessonId, options) {
  const payload = typeof options === 'string' ? { prompt: options } : options;
  const { data } = await api.post(`/lessons/${lessonId}/chat/quiz`, payload);
  return data.data;
}

export async function undoLastLessonEdit(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/chat/undo`);
  return data.data;
}
