import { useEffect, useState } from 'react';
import api from '../services/api';
import { Alert, Btn, FormField, Input } from './ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

export default function LessonEditModal({ lesson, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', topic: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm({ title: lesson?.title || '', topic: lesson?.topic || '' }); setError(''); }, [lesson]);
  if (!lesson) return null;
  async function submit(event) {
    event.preventDefault(); const title=form.title.trim(), topic=form.topic.trim();
    if(!title)return setError('Lesson title is required.');
    if(title.length>200)return setError('Lesson title must be 200 characters or fewer.');
    if(topic.length>500)return setError('Lesson topic must be 500 characters or fewer.');
    setLoading(true);setError('');
    try{const{data}=await api.patch(`/lessons/${lesson.id}`,{title,topic});onSaved(data.data.lesson);}
    catch(err){setError(err.response?.data?.error||'Unable to update this lesson.');}
    finally{setLoading(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!loading)onClose();}}><DialogContent showCloseButton={false}>
    <DialogHeader><DialogTitle>Edit lesson</DialogTitle><DialogDescription>Update the lesson title or topic without changing its status.</DialogDescription></DialogHeader>
    {error&&<Alert type="error" onClose={()=>setError('')}>{error}</Alert>}
    <form onSubmit={submit}><FormField label="Lesson Title *"><Input autoFocus required maxLength={200} value={form.title} onChange={event=>setForm(current=>({...current,title:event.target.value}))}/></FormField><FormField label="Topic (optional)"><Input maxLength={500} value={form.topic} onChange={event=>setForm(current=>({...current,topic:event.target.value}))}/></FormField><DialogFooter><Btn variant="ghost" disabled={loading} onClick={onClose}>Cancel</Btn><Btn type="submit" loading={loading}>Save Changes</Btn></DialogFooter></form>
  </DialogContent></Dialog>;
}