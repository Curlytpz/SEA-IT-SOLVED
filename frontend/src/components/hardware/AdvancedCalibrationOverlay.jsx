import { useRef } from 'react';
import { ADVANCED_POINT_ORDER, advancedCenter } from '../../utils/calibrationPlanes';

const LABELS = {
  topLeft: 'TL', topCenter: 'TC', topRight: 'TR',
  middleLeft: 'ML', middleRight: 'MR',
  bottomLeft: 'BL', bottomCenter: 'BC', bottomRight: 'BR',
};

export default function AdvancedCalibrationOverlay({ points, onChange, onDragEnd, disabled = false }) {
  const rootRef = useRef(null);
  const center = advancedCenter(points);
  const guides = [
    ['topLeft', 'topCenter', 'topRight'],
    ['middleLeft', center, 'middleRight'],
    ['bottomLeft', 'bottomCenter', 'bottomRight'],
    ['topLeft', 'middleLeft', 'bottomLeft'],
    ['topCenter', center, 'bottomCenter'],
    ['topRight', 'middleRight', 'bottomRight'],
  ];
  const coordinates = value => typeof value === 'string' ? points[value] : value;

  function update(name, clientX, clientY) {
    const rect = rootRef.current.getBoundingClientRect();
    onChange({ ...points, [name]: {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    } });
  }

  function pointerDown(name, event) {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    update(name, event.clientX, event.clientY);
  }

  function keyDown(name, event) {
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.01 : 0.002;
    const point = points[name];
    onChange({ ...points, [name]: {
      x: Math.min(1, Math.max(0, point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))),
      y: Math.min(1, Math.max(0, point.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))),
    } });
    onDragEnd?.();
  }

  return <div ref={rootRef} className="absolute inset-0 touch-none" aria-label="Advanced eight-point whiteboard calibration overlay">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {guides.map((guide, index) => <polyline key={index}
        points={guide.map(value => { const point = coordinates(value); return `${point.x * 100},${point.y * 100}`; }).join(' ')}
        fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity=".9"/>)}
    </svg>
    {ADVANCED_POINT_ORDER.map(name => <button key={name} type="button" disabled={disabled}
      aria-label={`Move ${name.replace(/([A-Z])/g, ' $1').toLowerCase()} advanced calibration point`}
      className="absolute z-[5] h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab rounded-full border-0 bg-transparent p-0 before:absolute before:inset-[.65rem] before:rounded-full before:border-[3px] before:border-white before:bg-[var(--plane-color,#2563eb)] before:shadow-[0_0_0_2px_var(--plane-color,#2563eb),0_3px_10px_rgba(15,23,42,.38)] before:content-[''] active:cursor-grabbing focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-amber-400" style={{ left: `${points[name].x * 100}%`, top: `${points[name].y * 100}%`, '--plane-color': '#2563eb' }}
      onPointerDown={event => pointerDown(name, event)}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) update(name, event.clientX, event.clientY); }}
      onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
      onKeyDown={event => keyDown(name, event)}><span className="pointer-events-none absolute left-1/2 top-[2.35rem] -translate-x-1/2 whitespace-nowrap rounded-[.4rem] bg-slate-950/90 px-[.38rem] py-[.18rem] text-[.6rem] font-bold text-white">{LABELS[name]}</span></button>)}
  </div>;
}
