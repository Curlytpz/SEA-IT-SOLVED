import { useEffect } from 'react';

export default function CameraPreview({ mode, stream, status, service, videoRef, canvasRef, children }) {
  useEffect(() => {
    if (mode === 'BROWSER' && videoRef.current) {
      videoRef.current.srcObject = stream || null;
      if (stream) videoRef.current.play().catch(()=>{});
    }
  }, [mode, stream, videoRef]);

  useEffect(() => {
    if (mode === 'SIMULATED' && status === 'READY') service.renderMockPreview(canvasRef.current);
  }, [mode, status, service, canvasRef]);

  return (
    <div className="isolate relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-slate-950 shadow-inner dark:border-border">
      {mode === 'BROWSER'
        ? <video ref={videoRef} muted playsInline className="pointer-events-none h-full w-full object-contain" />
        : <canvas ref={canvasRef} className="pointer-events-none h-full w-full object-contain" />}
      {status !== 'READY' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/80 px-6 text-center text-sm text-slate-300">{mode === 'SIMULATED' ? 'Start the demo whiteboard preview.' : 'Start the camera to display the calibration preview.'}</div>}
      {children}
    </div>
  );
}
