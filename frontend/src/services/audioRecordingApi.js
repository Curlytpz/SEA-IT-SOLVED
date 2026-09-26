import api from './api';
import { buildAudioRecordingFormData } from '../utils/audioRecording.js';

export async function createAudioRecording(lessonId,payload){
  const form=buildAudioRecordingFormData(payload);
  const {data}=await api.post(`/lessons/${lessonId}/audio-recording`,form,{headers:{'Content-Type':'multipart/form-data'}});
  return data.data.recording;
}

export async function getLessonAudioRecording(lessonId){
  const {data}=await api.get(`/lessons/${lessonId}/audio-recording`);
  return data.data.recording;
}

export async function getSectionAudioRecordings(sectionId){
  const {data}=await api.get(`/sections/${sectionId}/audio-recordings`);
  return data.data.recordings;
}

export async function fetchAudioRecording(url){
  const {data}=await api.get(url.replace(/^\/api/,''),{responseType:'blob'});
  return URL.createObjectURL(data);
}

export async function deleteAudioRecording(recordingId){
  await api.delete(`/audio-recordings/${recordingId}`);
}
