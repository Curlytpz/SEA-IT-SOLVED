import api from './api';

export async function listLessonMaterials(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/materials`);
  return data.data.materials;
}
export async function uploadLessonMaterial(lessonId, file) {
  const form = new FormData();
  form.append('file', file, file.name);
  const { data } = await api.post(`/lessons/${lessonId}/materials`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data.material;
}
export async function deleteLessonMaterial(materialId) {
  await api.delete(`/lesson-materials/${materialId}`);
}
export async function reprocessLessonMaterial(materialId) {
  const { data } = await api.post(`/lesson-materials/${materialId}/reprocess`);
  return data.data;
}
