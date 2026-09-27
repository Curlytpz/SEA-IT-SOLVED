import api from './api';

export async function getLessonChat(lessonId, conversationId) {
  const { data } = await api.get(`/lessons/${lessonId}/chat`, {
    params: conversationId ? { conversationId } : undefined,
  });
  return data.data;
}

export async function sendLessonChatMessage(lessonId, payload, config = {}) {
  const body = typeof payload === 'string' ? { message: payload } : payload;
  const { data } = await api.post(`/lessons/${lessonId}/chat/messages`, body, config);
  return data.data;
}

export async function generateQuizFromLessonChat(lessonId, options, config = {}) {
  const payload = typeof options === 'string' ? { prompt: options } : options;
  const { data } = await api.post(`/lessons/${lessonId}/chat/quiz`, payload, config);
  return data.data;
}

export async function getQuizGenerationJob(lessonId, jobId, config = {}) {
  const { data } = await api.get(`/lessons/${lessonId}/quiz-generation-jobs/${jobId}`, config);
  return data.data;
}

export async function getActiveQuizGenerationJob(lessonId, config = {}) {
  const { data } = await api.get(`/lessons/${lessonId}/quiz-generation-jobs/active`, config);
  return data.data;
}

export async function undoLastLessonEdit(lessonId, payload = {}) {
  const { data } = await api.post(`/lessons/${lessonId}/chat/undo`, payload);
  return data.data;
}

export async function deleteLessonChatConversation(lessonId, conversationId) {
  const { data } = await api.delete(`/lessons/${lessonId}/chat/conversations/${conversationId}`);
  return data.data;
}
