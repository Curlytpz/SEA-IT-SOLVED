import { CORNER_ORDER } from '../../utils/calibrationPlanes';
import { X } from '../icons';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

function overlayPoints(plane) {
  if (Array.isArray(plane?.points) && plane.points.length >= 3) {
    return plane.points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  }
  const corners = plane?.perspectiveAnchors || plane?.corners;
  return corners ? CORNER_ORDER.map(name => corners[name]).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)) : [];
}

export default function CalibrationImageLightbox({ inspection, onClose }) {
  const points = overlayPoints(inspection?.plane);
  const polygon = points.map(point => `${point.x},${point.y}`).join(' ');

  return <Dialog open={Boolean(inspection)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex h-[calc(100dvh-.5rem)] max-h-[calc(100dvh-.5rem)] max-w-[calc(100%-0.5rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(96vw,1600px)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-700 sm:px-5">
        <DialogHeader className="min-w-0 flex-1">
          <DialogTitle>{inspection?.title || 'Camera Calibration — Full Size'}</DialogTitle>
          <DialogDescription>{inspection?.description || inspection?.label || 'Current whiteboard preview'}</DialogDescription>
        </DialogHeader>
        <button type="button" onClick={onClose} aria-label="Close full-size calibration viewer" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-400/10">
          <X size={20}/>
        </button>
      </header>
      <div className="flex min-h-0 flex-1 touch-auto items-center justify-center overflow-auto bg-slate-950 p-1 sm:p-4">
        {inspection && <div className="relative inline-block max-h-full max-w-full leading-none">
          <img
            src={inspection.url}
            alt={inspection.label || 'Full-size calibration whiteboard'}
            width={inspection.width}
            height={inspection.height}
            className="block h-auto max-h-[calc(100dvh-5.5rem)] w-auto max-w-full object-contain sm:max-h-[calc(100dvh-8rem)]"
          />
          {points.length >= 3 && <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <polygon points={polygon} fill="rgba(37,99,235,.12)" stroke="#60a5fa" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
          </svg>}
          {points.map((point, index) => <span key={point.id || index} aria-hidden="true" className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-white shadow" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}/>) }
        </div>}
      </div>
    </DialogContent>
  </Dialog>;
}
