import api from './api';

export async function createCapture(lessonId, payload) {
  const form = new FormData();
  form.append('original', payload.originalBlob, 'whiteboard-original.jpg');
  if (payload.correctedBlob) form.append('corrected', payload.correctedBlob, 'whiteboard-corrected.jpg');
  if (payload.planeResults?.length) {
    const manifest = payload.planeResults.map(result => ({
      id: result.planeId, label: result.label, order: result.order,
      corners: result.corners, width: result.width, height: result.height,
    }));
    payload.planeResults.forEach(result => form.append('correctedPlanes', result.blob, `whiteboard-plane-${result.order}.jpg`));
    form.append('planeManifest', JSON.stringify(manifest));
  }
  for (const [key, value] of Object.entries(payload.metadata)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  const { data } = await api.post(`/lessons/${lessonId}/captures`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data.capture;
}

export async function getCaptures(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/captures`);
  return data.data.captures;
}

export async function fetchCaptureBlob(url) {
  const { data } = await api.get(url.replace(/^\/api/, ''), { responseType: 'blob' });
  return data;
}
export async function fetchCaptureImage(url) {
  const { data } = await api.get(url.replace(/^\/api/, ''), { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export async function deleteCapture(id) { await api.delete(`/captures/${id}`); }