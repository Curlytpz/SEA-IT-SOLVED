import api from './api';

function extensionFor(blob){
  if(blob.type.includes('ogg'))return 'ogg';
  if(blob.type.includes('wav'))return 'wav';
  return 'webm';
}

export async function createAudioRecording(lessonId,payload){
  const form=new FormData();
  form.append('audio',payload.blob,`lesson-recording.${extensionFor(payload.blob)}`);
  for(const [key,value] of Object.entries(payload.metadata)){
    if(value!==undefined&&value!==null)form.append(key,key==='pauses'?JSON.stringify(value):String(value));
  }
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
