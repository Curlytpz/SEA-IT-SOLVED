import { useState } from 'react';
import { Btn,ConfirmModal } from '../ui';
import { deleteAudioRecording } from '../../services/audioRecordingApi';
import { Play,Trash } from '../icons';
import ProtectedAudioPlayer from './ProtectedAudioPlayer';

function fmt(ms){const total=Math.round((ms||0)/1000),m=Math.floor(total/60),s=total%60;return `${m}:${String(s).padStart(2,'0')}`;}

export default function LessonRecordingControl({recording,onDeleted,onError}){
  const [open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[deleting,setDeleting]=useState(false);
  if(!recording)return <span className="text-xs text-slate-400">No audio</span>;
  async function remove(){if(deleting)return;setDeleting(true);try{await deleteAudioRecording(recording.id);setConfirm(false);setOpen(false);onDeleted(recording.id);}catch(err){onError(err.response?.data?.error||'Unable to delete audio recording.');setConfirm(false);}finally{setDeleting(false);}}
  return <div className="min-w-48"><div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{fmt(recording.durationMs)}</span><Btn variant="secondary" size="sm" onClick={()=>setOpen(value=>!value)}><Play size={13}/> {open?'Hide':'Play'}</Btn><Btn variant="danger" size="sm" aria-label="Delete lesson audio recording" onClick={()=>setConfirm(true)}><Trash size={13}/></Btn></div>{open&&<div className="mt-2 w-72 max-w-[70vw]"><ProtectedAudioPlayer url={recording.audioUrl}/><p className="mt-1 text-[11px] text-slate-400">Recorded {new Date(recording.recordedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</p></div>}{confirm&&<ConfirmModal title="Delete this lesson recording?" body="This audio recording will be permanently removed. This action cannot be undone." confirmLabel="Delete Recording" confirmVariant="danger" loading={deleting} onConfirm={remove} onCancel={()=>setConfirm(false)}/>}</div>;
}
