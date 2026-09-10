import { useEffect, useMemo, useRef, useState } from 'react';

const clamp = value => Math.min(1, Math.max(0, value));
const makeId = () => globalThis.crypto?.randomUUID?.() || 'point-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const clone = value => JSON.parse(JSON.stringify(value));

function validPoint(point) {
  return point && typeof point.id === 'string' && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function straightSegments(points) {
  return points.map((point, index) => ({
    type: 'line',
    fromPointId: point.id,
    toPointId: points[(index + 1) % points.length].id,
  }));
}

function validSnapshot(plane) {
  if (!plane || !Array.isArray(plane.points) || plane.points.length < 3 || !plane.points.every(validPoint)) return false;
  const ids = new Set(plane.points.map(point => point.id));
  return ids.size === plane.points.length;
}

function pointsMoved(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return true;
  return before.some((point, index) => point.x !== after[index]?.x || point.y !== after[index]?.y);
}

function distanceToSegment(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared) : 0;
  const projected = { x: from.x + ratio * dx, y: from.y + ratio * dy };
  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

export default function CalibrationOverlay({ planes = [], selectedId, onPlaneChange, onDragEnd }) {
  const rootRef = useRef(null);
  const mediaElementRef = useRef(null);
  const dragStartRef = useRef(null);
  const selectedPlane = planes.find(plane => plane.id === selectedId) || planes[0] || null;
  const [tool, setTool] = useState('select');
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [history, setHistory] = useState([]);
  const [mediaBox, setMediaBox] = useState({ left: 0, top: 0, width: 1, height: 1, outerWidth: 1, outerHeight: 1 });
  // No local point buffer. The overlay is fully controlled: all point positions come from props.
  // Every drag move calls onPlaneChange immediately so the parent is the single source of truth.
  const points = selectedPlane?.points || [];
  const renderPoints = points;
  const selectedPlaneRef = useRef(selectedPlane);
  const pointsRef = useRef(points);
  const onPlaneChangeRef = useRef(onPlaneChange);
  const onDragEndRef = useRef(onDragEnd);

  selectedPlaneRef.current = selectedPlane;
  pointsRef.current = points;
  onPlaneChangeRef.current = onPlaneChange;
  onDragEndRef.current = onDragEnd;

  const pointsById = useMemo(() => Object.fromEntries(renderPoints.filter(validPoint).map(point => [point.id, point])), [renderPoints]); // renderPoints === points (fully controlled)
  const selectedPoint = selectedPointId ? pointsById[selectedPointId] : null;
  const canDelete = Boolean(selectedPoint && points.length > 3);

  useEffect(() => {
    setSelectedPointId(null);
    setHistory([]);
    setTool('select');
  }, [selectedPlane?.id]);

  useEffect(() => {
    if (selectedPointId && !selectedPoint) setSelectedPointId(null);
  }, [selectedPointId, selectedPoint]);

  useEffect(() => {
    const root = rootRef.current;
    const media = root?.parentElement?.querySelector('canvas, video');
    if (!root || !media) return undefined;
    mediaElementRef.current = media;
    let frame = 0;
    function measure() {
      const rootRect = root.getBoundingClientRect();
      const rendered = renderedMediaRect(media);
      if (!rootRect.width || !rootRect.height || !rendered) return;
      setMediaBox({
        left: rendered.left - rootRect.left,
        top: rendered.top - rootRect.top,
        width: rendered.width, height: rendered.height, outerWidth: rootRect.width, outerHeight: rootRect.height,
      });
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }
    const observer = new ResizeObserver(schedule);
    observer.observe(root); observer.observe(media);
    media.addEventListener?.('loadedmetadata', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      media.removeEventListener?.('loadedmetadata', schedule);
      if (mediaElementRef.current === media) mediaElementRef.current = null;
    };
  }, [selectedPlane?.id]);

  function renderedMediaRect(media) {
    if (!media) return null;
    const elementRect = media.getBoundingClientRect();
    const sourceWidth = media.videoWidth || media.width || elementRect.width;
    const sourceHeight = media.videoHeight || media.height || elementRect.height;
    if (!elementRect.width || !elementRect.height || !sourceWidth || !sourceHeight) return null;
    const scale = Math.min(elementRect.width / sourceWidth, elementRect.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      left: elementRect.left + (elementRect.width - width) / 2,
      top: elementRect.top + (elementRect.height - height) / 2,
      width,
      height,
    };
  }

  function position(event) {
    const rendered = renderedMediaRect(mediaElementRef.current);
    if (!rendered) return null;
    return {
      x: clamp((event.clientX - rendered.left) / rendered.width),
      y: clamp((event.clientY - rendered.top) / rendered.height),
    };
  }

  function displayed(point) {
    return { x: mediaBox.left + point.x * mediaBox.width, y: mediaBox.top + point.y * mediaBox.height };
  }

  function normalizedPlane(nextPlane) {
    return {
      ...nextPlane,
      tracePoints: nextPlane.points,
      closed: true,
      segments: straightSegments(nextPlane.points),
    };
  }

  function commit(nextPlane) {
    if (!selectedPlane || !validSnapshot(nextPlane)) return;
    setHistory(current => [...current.slice(-29), clone(selectedPlane)]);
    onPlaneChange(selectedPlane.id, normalizedPlane(nextPlane));
    onDragEndRef.current?.();
  }

  function addNearestPoint(point) {
    if (!selectedPlane || !point || points.length < 2) return;
    let nearestIndex = 0, nearestDistance = Infinity;
    points.forEach((from, index) => {
      const to = points[(index + 1) % points.length];
      const distance = distanceToSegment(
        { x: point.x * mediaBox.width, y: point.y * mediaBox.height },
        { x: from.x * mediaBox.width, y: from.y * mediaBox.height },
        { x: to.x * mediaBox.width, y: to.y * mediaBox.height },
      );
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
    });
    if (nearestDistance > 16) return;
    const nextPoint = { id: makeId(), ...point };
    const nextPoints = [...points.slice(0, nearestIndex + 1), nextPoint, ...points.slice(nearestIndex + 1)];
    commit({ ...selectedPlane, points: nextPoints });
    setSelectedPointId(nextPoint.id);
    setTool('select');
  }

  function deletePoint() {
    if (!selectedPlane || !canDelete) return;
    commit({ ...selectedPlane, points: points.filter(point => point.id !== selectedPoint.id) });
    setSelectedPointId(null);
  }

  function undo() {
    if (!selectedPlane || !history.length) return;
    const previous = history.at(-1);
    setHistory(current => current.slice(0, -1));
    if (validSnapshot(previous)) onPlaneChange(selectedPlane.id, normalizedPlane(clone(previous)));
    onDragEndRef.current?.();
    setSelectedPointId(null);
    setTool('select');
  }

  function resetPlane() {
    if (!selectedPlane) return;
    const anchors = clone(selectedPlane.perspectiveAnchors || selectedPlane.corners);
    const nextPoints = Object.entries(anchors).map(([anchorName, point]) => ({ id: makeId(), anchorName, ...point }));
    commit({
      ...selectedPlane,
      corners: anchors,
      perspectiveAnchors: anchors,
      points: nextPoints,
      closed: true,
    });
    setSelectedPointId(null);
    setTool('select');
  }

  function beginDrag(pointId, event) {
    if (tool !== 'select' || !selectedPlane) return;
    event.preventDefault();
    event.stopPropagation();
    const captureTarget = event.currentTarget;
    const startPlane = clone(selectedPlaneRef.current);
    const moveListener = pointerEvent => moveDrag(pointerEvent);
    const finishListener = pointerEvent => finishDrag(pointerEvent);
    dragStartRef.current = {
      pointerId: event.pointerId,
      pointId,
      startPlane,
      captureTarget,
      moveListener,
      finishListener,
    };
    captureTarget.addEventListener('pointermove', moveListener, { passive: false });
    captureTarget.addEventListener('pointerup', finishListener);
    captureTarget.addEventListener('pointercancel', finishListener);
    captureTarget.addEventListener('lostpointercapture', finishListener);
    captureTarget.setPointerCapture?.(event.pointerId);
  }

  // Live update: immediately propagate each pointer position to the parent so it is the
  // single source of truth. The overlay re-renders from the updated props on every move.
  // IMPORTANT: do NOT call normalizedPlane() here. normalizedPlane() recomputes corners and
  // perspectiveAnchors, which causes calibrationPlanes() in the parent to potentially
  // reconstruct the points array with new IDs. That would make drag.pointId not match any
  // point in the next render's props, silently breaking all subsequent moves.
  // Corner/segment normalisation only happens once, in commit(), on release or explicit actions.
  function moveDrag(event) {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const next = position(event);
    if (!next) return;
    const activePlane = selectedPlaneRef.current;
    if (!activePlane) return;
    const updatedPoints = pointsRef.current.map(point => point.id === drag.pointId ? { ...point, ...next } : point);
    // Pass the plane with updated raw points only — no normalisation — so point IDs are
    // preserved exactly as the parent handed them down, and the next render's pointsRef is stable.
    onPlaneChangeRef.current?.(activePlane.id, { ...activePlane, points: updatedPoints, tracePoints: updatedPoints });
  }

  // On release: clean up pointer capture, then commit the normalised plane once so that
  // corners/perspectiveAnchors/segments are canonical in the saved state.
  function finishDrag(event) {
    const drag = dragStartRef.current;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    dragStartRef.current = null;
    drag.captureTarget?.removeEventListener('pointermove', drag.moveListener);
    drag.captureTarget?.removeEventListener('pointerup', drag.finishListener);
    drag.captureTarget?.removeEventListener('pointercancel', drag.finishListener);
    drag.captureTarget?.removeEventListener('lostpointercapture', drag.finishListener);
    if (drag.captureTarget?.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);

    const activePlane = selectedPlaneRef.current;
    if (!activePlane || !validSnapshot(activePlane)) return;
    const changed = pointsMoved(drag.startPlane.points, activePlane.points);
    if (!changed) return;
    setHistory(current => [...current.slice(-29), drag.startPlane]);
    onPlaneChangeRef.current?.(activePlane.id, normalizedPlane(activePlane));
    onDragEndRef.current?.();
  }

  useEffect(() => {
    function keyboard(event) {
      if (event.key === 'Escape') { setSelectedPointId(null); setTool('select'); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && canDelete) {
        event.preventDefault();
        deletePoint();
        return;
      }
      if (!selectedPlane || !selectedPoint || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? .01 : .002;
      commit({ ...selectedPlane, points: points.map(point => point.id === selectedPoint.id ? {
        ...point,
        x: clamp(point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
        y: clamp(point.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)),
      } : point) });
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });

  if (!selectedPlane) return null;

  const toolbar = [
    ['select', 'Select', false],
    ['add', 'Add Point', false],
    ['delete', 'Delete', !canDelete],
    ['undo', 'Undo', !history.length],
    ['reset', 'Reset', false],
  ];

  const boundary = renderPoints.map(point => { const shown = displayed(point); return shown.x + ',' + shown.y; }).join(' ');

  return <div ref={rootRef} className="absolute inset-0 z-20 pointer-events-auto select-none touch-none" aria-label="Board trace calibration editor"
    onPointerDown={event => {
      const isToolbarButton = !!event.target.closest?.('button');
      // Contain every pointer interaction inside the calibration editor. Without this, clicks in
      // "select" mode that land on empty space (not a point) had nothing stopping them, so they
      // bubbled up to whatever ancestor handles image click/zoom (e.g. a photo lightbox trigger).
      if (!isToolbarButton) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!isToolbarButton && tool === 'add') {
        addNearestPoint(position(event));
      }
    }}
    onClick={event => {
      if (!event.target.closest?.('button')) { event.preventDefault(); event.stopPropagation(); }
    }}>
    <div className="absolute left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 rounded-lg bg-slate-950/85 p-1.5 shadow-lg">
      {toolbar.map(([name, label, disabled]) => <button key={name} type="button" disabled={disabled}
        onClick={() => {
          if (name === 'delete') return deletePoint();
          if (name === 'undo') return undo();
          if (name === 'reset') return resetPlane();
          setTool(name);
        }}
        className={'rounded px-2 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-35 ' + (tool === name ? 'bg-primary text-primary-foreground' : 'text-white hover:bg-white/15')}
        aria-pressed={tool === name}>{label}</button>)}
    </div>

    <svg viewBox={'0 0 ' + mediaBox.outerWidth + ' ' + mediaBox.outerHeight} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
      <polygon points={boundary} fill="rgba(37,99,235,.10)" stroke="#2563eb" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
    </svg>

    {renderPoints.map(point => <button key={point.id} type="button" aria-label="Trace point"
      className="absolute z-20 grid w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-auto touch-none place-items-center"
      style={{ left: displayed(point).x, top: displayed(point).y }}
      onPointerDown={event => {
        if (tool !== 'select') return;
        event.preventDefault();
        event.stopPropagation();
        setSelectedPointId(point.id);
        beginDrag(point.id, event);
      }}>
      <span className={'pointer-events-none h-4 w-4 rounded-full border-2 border-primary bg-white ' + (selectedPoint?.id === point.id ? 'ring-4 ring-amber-300' : '')}/>
    </button>) }

  </div>;
}
