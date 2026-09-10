import api from './api';

export async function getLessonRecognitions(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/recognitions`);
  return data.data;
}

export async function processLessonCaptures(lessonId) {
  const { data } = await api.post(`/lessons/${lessonId}/recognitions`);
  return data.data;
}

export async function processCapture(captureId) {
  const { data } = await api.post(`/captures/${captureId}/recognition`);
  return data.data;
}

export async function reprocessCapture(captureId) {
  const { data } = await api.post(`/captures/${captureId}/recognition/reprocess`);
  return data.data;
}

