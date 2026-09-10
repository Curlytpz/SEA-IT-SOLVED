import api from './api';

export async function getLessonTranscription(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/transcription`);
  return data.data;
}

export async function processLessonTranscription(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/transcription`);
  return data.data;
}

export async function reprocessLessonTranscription(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/transcription/reprocess`);
  return data.data;
}
