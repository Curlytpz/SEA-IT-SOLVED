import { useEffect, useRef, useState } from 'react';
import { Alert, Btn } from '../ui';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';

export default function SolutionCamera({ onClose, onUse }) {
  const video = useRef(null), stream = useRef(null);
  const [photo, setPhoto] = useState(null), [url, setUrl] = useState(''), [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
        const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) { next.getTracks().forEach(track => track.stop()); return; }
        stream.current = next;
        if (video.current) video.current.srcObject = next;
      } catch { if (active) setError('Camera access is unavailable. You can still upload an image from your device.'); }
    }
    start();
    return () => { active = false; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
  }, []);
  useEffect(() => { const next = photo ? URL.createObjectURL(photo) : ''; setUrl(next); return () => { if (next) URL.revokeObjectURL(next); }; }, [photo]);
  function capture() {
    const source = video.current;
    if (!source?.videoWidth) return;
    const canvas = document.createElement('canvas'); canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    canvas.getContext('2d').drawImage(source, 0, 0);
    canvas.toBlob(blob => { if (stream.current && blob) setPhoto(new File([blob], 'handwritten-solution.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="sm:max-w-2xl">
    <DialogTitle>Photograph your solution</DialogTitle><DialogDescription>Align the full handwritten page in the frame. Your photo is not uploaded until you save it.</DialogDescription>
    {error && <Alert type="error" label="Camera unavailable" className="mb-0">{error}</Alert>}
    <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} className={`max-h-[50dvh] w-full rounded-lg bg-slate-950 object-contain ${photo ? 'hidden' : ''}`}/>
    {url && <img src={url} alt="Captured handwritten work" className="max-h-[50dvh] w-full rounded-lg object-contain"/>}
    <DialogFooter><Btn variant="ghost" onClick={onClose}>Cancel</Btn>{photo ? <><Btn variant="secondary" onClick={() => setPhoto(null)}>Retake</Btn><Btn onClick={() => { onUse(photo); onClose(); }}>Use Photo</Btn></> : <Btn disabled={!ready || Boolean(error)} onClick={capture}>Capture Photo</Btn>}</DialogFooter>
  </DialogContent></Dialog>;
}
