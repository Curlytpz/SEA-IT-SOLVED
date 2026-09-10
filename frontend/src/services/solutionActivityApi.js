import api from './api';

export async function getInstructorSolutionActivities(lessonId) {
  const { data } = await api.get(`/lessons/${lessonId}/solution-activities`);
  return data.data.activities;
}
export async function createSolutionActivity(lessonId, payload) {
  const { data } = await api.post(`/lessons/${lessonId}/solution-activities`, payload);
  return data.data.activity;
}
export async function updateSolutionActivity(activityId, payload) {
  const { data } = await api.put(`/solution-activities/${activityId}`, payload);
  return data.data.activity;
}
export async function changeSolutionActivityStatus(activityId, action) {
  const { data } = await api.post(`/solution-activities/${activityId}/${action}`);
  return data.data.activity;
}
export async function deleteSolutionActivity(activityId) {
  await api.delete(`/solution-activities/${activityId}`);
}
export async function getSolutionSubmissions(activityId) {
  const { data } = await api.get(`/solution-activities/${activityId}/submissions`);
  return data.data.submissions;
}
export async function retrySolutionRecognition(submissionId) {
  const { data } = await api.post(`/solution-submissions/${submissionId}/recognize`);
  return data.data.submission;
}
export async function analyzeSolutionSubmission(submissionId) {
  const { data } = await api.post(`/solution-submissions/${submissionId}/analyze`, undefined, { timeout: 300000 });
  return data.data.submission;
}
export async function gradeSolutionSubmission(submissionId, payload) {
  const { data } = await api.put(`/solution-submissions/${submissionId}/grade`, payload);
  return data.data.submission;
}
export async function reopenSolutionSubmission(submissionId) {
  const { data } = await api.post(`/solution-submissions/${submissionId}/reopen`);
  return data.data.submission;
}
export async function getStudentSolutionActivities(lessonId) {
  const { data } = await api.get(`/student/lessons/${lessonId}/solution-activities`);
  return data.data.activities;
}
export async function submitSolutionImage(activityId, file) {
  const form = new FormData();
  form.append('image', file, file.name || 'solution-image');
  const { data } = await api.post(`/student/solution-activities/${activityId}/submission`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000,
  });
  return data.data.submission;
}
