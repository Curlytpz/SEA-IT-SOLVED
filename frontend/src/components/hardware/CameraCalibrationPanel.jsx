import { useEffect, useMemo, useRef, useState } from 'react';
import useCamera from '../../hooks/useCamera';
import { getCalibration, getCalibrations, getHardwareSettings, saveCalibration, saveHardwareSettings } from '../../services/hardwareApi';
import { correctCalibration, detectBoardBoundary } from '../../utils/perspectiveCorrection';
import { CALIBRATION_MODES, calibrationPlanes, createDefaultPlanes, preparePlaneForPerspective, validatePlane } from '../../utils/calibrationPlanes';
import { defaultCameraSourceKey } from '../../hardware/camera/cameraSources';
import { Alert, Btn, Card, FormField, Select } from '../ui';
import { Camera } from '../icons';
import CameraPreview from './CameraPreview';
import CalibrationOverlay from './CalibrationOverlay';
import CalibrationImageLightbox from './CalibrationImageLightbox';
import HardwareStatus from './HardwareStatus';
import { ConfiguredSummary, SettingsPanelHeader } from './HardwareSettingsState';

function previewUrl(canvas) { return canvas.toDataURL('image/jpeg', 0.9); }
function inspectionUrl(canvas) { return canvas.toDataURL('image/png'); }
function cloneCalibration(value) { return value ? structuredClone(value) : null; }
function calibrationVersion(value) {
  if (!value) return null;
  const geometry = JSON.stringify((value.planes || []).map(plane => ({
    id: plane.id,
    corners: plane.perspectiveAnchors || plane.corners,
    points: plane.points || plane.tracePoints,
  })));
  let hash = 2166136261;
  for (let index = 0; index < geometry.length; index += 1) hash = Math.imul(hash ^ geometry.charCodeAt(index), 16777619);
  return `${value.updatedAt || value.version || value.id || 'calibration'}:${(hash >>> 0).toString(36)}`;
}

export default function CameraCalibrationPanel() {
  const [mode, setMode] = useState('SIMULATED');
  const [sourceKey, setSourceKey] = useState(defaultCameraSourceKey('SIMULATED'));
  const [draftCalibration, setDraftCalibration] = useState(() => ({ calibrationMode: CALIBRATION_MODES.SIMPLE, planes: createDefaultPlanes({ demo: true }) }));
  const [selectedPlaneId, setSelectedPlaneId] = useState('');
  const calibrationMode = CALIBRATION_MODES.SIMPLE;
  const [calibrations, setCalibrations] = useState([]);
  const [savedCalibration, setSavedCalibration] = useState(null);
  const [savedSelection, setSavedSelection] = useState(null);
  const [savedCalibrationVersion, setSavedCalibrationVersion] = useState(null);
  const [previewCalibrationVersion, setPreviewCalibrationVersion] = useState(null);
  const [editing, setEditing] = useState(true);
  const [originalPreview, setOriginalPreview] = useState('');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [inspection, setInspection] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState({ text: '', type: 'success' });
  const videoRef = useRef(null), canvasRef = useRef(null), lastFrameRef = useRef(null), previewTimerRef = useRef(null), previewRequestRef = useRef(0), simulatedAutoStartRef = useRef(''), savedCalibrationRef = useRef(null);
  const camera = useCamera(mode);

  const planes = useMemo(() => calibrationPlanes(draftCalibration).slice(0, 1), [draftCalibration]);
  const selectedCalibration = useMemo(() => calibrations.find(item => item.sourceKey === sourceKey), [calibrations, sourceKey]);
  const selectedPlane = planes.find(plane => plane.id === selectedPlaneId) || planes[0] || null;
  const calibrationValid = Boolean(selectedPlane?.points?.length >= 4);
  const deviceLabel = camera.devices.find(device => device.id === sourceKey)?.label || (mode === 'SIMULATED' ? 'Demo Whiteboard' : 'Selected camera');

  useEffect(() => () => clearTimeout(previewTimerRef.current), []);

  useEffect(() => {
    Promise.all([getHardwareSettings(), getCalibrations()]).then(([settings, saved]) => {
      const nextMode = settings.hardwareMode || 'SIMULATED';
      const nextSource = settings.cameraSourceKey || defaultCameraSourceKey(nextMode);
      setMode(nextMode); setSourceKey(nextSource); setSavedSelection({ mode: nextMode, sourceKey: nextSource }); setCalibrations(saved);
    }).catch(err => setMessage({ text: err.response?.data?.error || 'Unable to load camera settings.', type: 'error' }));
  }, []);

  useEffect(() => {
    const savedSnapshot = cloneCalibration(selectedCalibration);
    const next = calibrationPlanes(savedSnapshot?.planes ? savedSnapshot : savedSnapshot?.points || savedSnapshot).slice(0, 1);
    setDraftCalibration({ calibrationMode: CALIBRATION_MODES.SIMPLE, planes: cloneCalibration(next) });
    setSelectedPlaneId(next[0]?.id || ''); setIsDirty(false);
    if (savedSnapshot) {
      savedCalibrationRef.current = savedSnapshot;
      setSavedCalibration(savedSnapshot); setSavedCalibrationVersion(calibrationVersion(savedSnapshot)); setEditing(false);
    } else {
      savedCalibrationRef.current = null;
      setSavedCalibration(null); setSavedCalibrationVersion(null); setEditing(true);
    }
    invalidatePreview();
  }, [selectedCalibration, mode]);

  useEffect(() => {
    camera.stop(); invalidatePreview();
    // Intentionally scoped to `mode` only. `camera.stop` is a fresh function reference on every
    // render of useCamera(), so including it here made this effect re-fire on *every* render -
    // including the ones triggered by dragging a calibration point - which stopped the camera
    // mid-drag and unmounted <CalibrationOverlay> (it only renders while camera.status === 'READY').
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== 'SIMULATED') {
      simulatedAutoStartRef.current = '';
      return;
    }
    const autoStartKey = `${mode}:${sourceKey}`;
    if (!sourceKey || camera.status !== 'STOPPED' || simulatedAutoStartRef.current === autoStartKey) return;
    simulatedAutoStartRef.current = autoStartKey;
    camera.start(sourceKey).catch(() => { /* friendly hook error */ });
    // Scoped to the values that should actually trigger an auto-start attempt; `camera.start`
    // itself is a new function reference on every render and would otherwise re-run this on
    // every draft-calibration update (e.g. while dragging a point).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.status, mode, sourceKey]);

  useEffect(() => { if (!sourceKey && camera.devices.length) setSourceKey(camera.devices[0].id); }, [camera.devices, sourceKey]);

  async function startCamera() { try { await camera.start(sourceKey || undefined); } catch { /* friendly hook error */ } }
  function frameSource() { return mode === 'BROWSER' ? videoRef.current : canvasRef.current; }

  function calibrationDraft(nextPlanes = planes) {
    return { calibrationMode: CALIBRATION_MODES.SIMPLE, planes: cloneCalibration(nextPlanes) };
  }

  async function renderCorrected(frame, calibration, requestVersion, calibrationVersionSnapshot) {
    const results = await correctCalibration(frame.canvas, calibration);
    if (requestVersion !== previewRequestRef.current) return false;
    if (calibrationVersion(savedCalibrationRef.current) !== calibrationVersionSnapshot) return false;
    const result = results[0];
    const nextPreview = result ? { id: result.planeId, label: result.label, url: inspectionUrl(result.canvas), width: result.width, height: result.height, version: requestVersion, calibrationVersion: calibrationVersionSnapshot } : null;
    setInspection(nextPreview ? {
      ...nextPreview,
      title: 'Corrected Board',
      description: `${nextPreview.width} × ${nextPreview.height} • Latest saved calibration`,
      kind: 'corrected',
      plane: null,
    } : null);
    setPreviewVersion(requestVersion); setPreviewCalibrationVersion(calibrationVersionSnapshot);
    return !!result;
  }

  async function testCapture() {
    if (!sourceKey) return setMessage({ text: 'Select a camera before previewing the corrected board.', type: 'error' });
    if (isDirty) {
      setMessage({ text: 'Save or cancel the current calibration changes before previewing.', type: 'error' }); return;
    }
    setProcessing(true); setMessage({ text: '', type: 'success' });
    const requestVersion = ++previewRequestRef.current;
    setOriginalPreview(''); setInspection(null); setPreviewCalibrationVersion(null); setPreviewVersion(requestVersion);
    try {
      const latestCalibration = await getCalibration(sourceKey);
      if (requestVersion !== previewRequestRef.current) return;
      if (!latestCalibration) throw new Error('Save calibration before previewing the corrected board.');
      const calibrationSnapshot = cloneCalibration(latestCalibration);
      const previewPlane = preparePlaneForPerspective(calibrationPlanes(calibrationSnapshot)[0]);
      const previewError = previewPlane ? validatePlane(previewPlane) : 'Four perspective anchors are required.';
      if (previewError) throw new Error(previewError);
      calibrationSnapshot.planes = [previewPlane];
      const calibrationVersionSnapshot = calibrationVersion(calibrationSnapshot);
      savedCalibrationRef.current = calibrationSnapshot;
      setSavedCalibration(calibrationSnapshot);
      setSavedCalibrationVersion(calibrationVersionSnapshot);
      const frame = await camera.service.captureFrame(frameSource(), { encode: false });
      if (requestVersion !== previewRequestRef.current) return;
      lastFrameRef.current = frame;
      setOriginalPreview(previewUrl(frame.canvas));
      const rendered = await renderCorrected(frame, calibrationSnapshot, requestVersion, calibrationVersionSnapshot);
      if (!rendered) return;
      setMessage({ text: 'Corrected region generated locally.', type: 'success' });
    } catch (err) {
      if (requestVersion === previewRequestRef.current) setMessage({ text: err.message || 'Start the camera before previewing the corrected board.', type: 'error' });
    } finally {
      if (requestVersion === previewRequestRef.current) setProcessing(false);
    }
  }
  async function save() {
    const source = frameSource();
    const width = mode === 'BROWSER' ? source?.videoWidth : source?.width;
    const height = mode === 'BROWSER' ? source?.videoHeight : source?.height;
    if (!width || !height) return setMessage({ text: 'Start the camera before saving calibration.', type: 'error' });
    const preparedPlane = preparePlaneForPerspective(selectedPlane);
    const calibrationError = preparedPlane ? validatePlane(preparedPlane) : 'Four perspective anchors are required.';
    if (!calibrationValid || calibrationError) return setMessage({ text: calibrationError || 'Add at least one calibration plane.', type: 'error' });
    invalidatePreview();
    setSaving(true);
    try {
      await saveHardwareSettings({ hardwareMode: mode, cameraSourceKey: sourceKey });
      const calibration = await saveCalibration({ sourceKey, hardwareMode: mode, sourceWidth: width, sourceHeight: height, calibrationMode: CALIBRATION_MODES.SIMPLE, planes: [{ ...preparedPlane, order: 1 }] });
      const latestSaved = cloneCalibration(calibration);
      const nextPlanes = calibrationPlanes(latestSaved).slice(0, 1);
      const latestVersion = calibrationVersion(latestSaved);
      savedCalibrationRef.current = latestSaved;
      setSavedCalibration(latestSaved);
      setSavedCalibrationVersion(latestVersion);
      setDraftCalibration({ calibrationMode: CALIBRATION_MODES.SIMPLE, planes: cloneCalibration(nextPlanes) });
      setSelectedPlaneId(nextPlanes[0]?.id || '');
      setSavedSelection({ mode, sourceKey }); setIsDirty(false);
      invalidatePreview();
      setCalibrations(current => [latestSaved, ...current.filter(item => item.sourceKey !== latestSaved.sourceKey)]);
      setEditing(false); setMessage({ text: 'Calibration saved successfully.', type: 'success' });
    } catch (err) { setMessage({ text: err.response?.data?.error || 'Unable to save calibration.', type: 'error' }); }
    finally { setSaving(false); }
  }

  function invalidatePreview() {
    const nextVersion = ++previewRequestRef.current;
    setOriginalPreview(''); setInspection(null); setPreviewVersion(nextVersion); setPreviewCalibrationVersion(null); setProcessing(false); lastFrameRef.current = null;
  }
  // Fast path used by CalibrationOverlay on every pointermove and addNearestPoint.
  // Directly replaces the matching plane WITHOUT re-running calibrationPlanes() on the result.
  // calibrationPlanes() can regenerate point IDs when it sees freshly-computed corners on the
  // incoming value — that broke drag (pointId no longer matched after first move) and add-point
  // (new point vanished immediately). Bypassing it keeps IDs stable across every render.
  function updatePlane(id, updatedPlane) {
    setDraftCalibration(current => ({
      ...current,
      planes: (current.planes || []).map(plane =>
        plane.id === id ? cloneCalibration(updatedPlane) : plane
      ),
    }));
    setIsDirty(true);
  }

  // Full-normalisation path for discrete one-shot actions only (autoDetect, external corner sets).
  function updateCorners(id, value) {
    setDraftCalibration(current => calibrationDraft(calibrationPlanes(current).slice(0, 1).map(plane => plane.id === id ? (value?.points ? cloneCalibration(value) : { ...plane, corners: value, perspectiveAnchors: value }) : plane)));
    setIsDirty(true);
  }
  function beginEditing() {
    const next = calibrationPlanes(savedCalibration).slice(0, 1);
    setDraftCalibration(calibrationDraft(next)); setSelectedPlaneId(next[0]?.id || '');
    setIsDirty(false); invalidatePreview(); setEditing(true);
  }
  async function autoDetect() {
    if (camera.status !== 'READY' || !selectedPlane) return;
    setDetecting(true); setMessage({ text: '', type: 'success' });
    try {
      const frame = await camera.service.captureFrame(frameSource(), { encode: false });
      const detected = await detectBoardBoundary(frame.canvas);
      if (!detected) {
        setMessage({ text: 'Board could not be detected reliably. Adjust the points manually.', type: 'warning' });
        return;
      }
      const nextPoints = detected.points.map(point => ({ id: globalThis.crypto?.randomUUID?.() || 'detected-' + Math.random().toString(36).slice(2), ...point }));
      updateCorners(selectedPlane.id, {
        ...selectedPlane, corners: detected.corners, perspectiveAnchors: detected.corners,
        points: nextPoints, tracePoints: nextPoints, closed: true,
      });
      invalidatePreview();
      setMessage({ text: 'Board detected. Review the boundary before saving.', type: 'success' });
    } catch {
      setMessage({ text: 'Board could not be detected reliably. Adjust the points manually.', type: 'warning' });
    } finally { setDetecting(false); }
  }
  function cancel() {
    if (!savedCalibration) return;
    const next = calibrationPlanes(savedCalibration).slice(0, 1);
    setMode(savedSelection?.mode || savedCalibration.hardwareMode); setSourceKey(savedSelection?.sourceKey || savedCalibration.sourceKey);
    setDraftCalibration(calibrationDraft(next)); setSelectedPlaneId(next[0]?.id || ''); setIsDirty(false);
    invalidatePreview(); setEditing(false); setMessage({ text: '', type: 'success' });
  }

  const visibleInspection = inspection?.kind === 'corrected' && (
    !previewCalibrationVersion || previewCalibrationVersion !== savedCalibrationVersion || inspection.calibrationVersion !== savedCalibrationVersion
  ) ? null : inspection;

  return <div id="camera-calibration" className="space-y-5 scroll-mt-24">
    {message.text && <Alert type={message.type} onClose={() => setMessage({ text: '', type: 'success' })}>{message.text}</Alert>}
    <Card className="p-5">
      <SettingsPanelHeader icon={<Camera size={17}/>} title="Camera Calibration" description="Trace one precise board region while four internal anchors preserve perspective correction." editing={editing} configured={!!savedCalibration}/>
      {!editing && savedCalibration ? <ConfiguredSummary items={[{ label: 'Camera', value: deviceLabel }, { label: 'Calibration', value: 'Single region' }]}>
        <Btn onClick={beginEditing}>Change Calibration</Btn>
        {camera.status !== 'READY' && <Btn variant="secondary" onClick={startCamera}>{mode === 'SIMULATED' ? 'Start Preview' : 'Start Camera'}</Btn>}
        {camera.status === 'READY' && mode !== 'SIMULATED' && <Btn variant="secondary" onClick={camera.stop}>Stop Camera</Btn>}
        <Btn variant="secondary" disabled={camera.status !== 'READY'} loading={processing} onClick={testCapture}>Preview Corrected Board</Btn>
      </ConfiguredSummary> : <>
        <div className="grid gap-4 mb-4 sm:grid-cols-2">
          <FormField label="Hardware Mode"><Select value={mode} onChange={event => { const next = event.target.value; setMode(next); setSourceKey(defaultCameraSourceKey(next)); }}><option value="SIMULATED">Simulated / Development</option><option value="BROWSER">Browser Webcam</option><option value="REAL" disabled>Real Raspberry Pi Hardware (Later)</option></Select></FormField>
          <FormField label="Camera Device"><Select value={sourceKey} onChange={event => setSourceKey(event.target.value)} disabled={camera.status === 'READY'}>{!camera.devices.length && <option value="">No camera detected</option>}{camera.devices.map(device => <option key={device.id} value={device.id}>{device.label}</option>)}</Select></FormField>
        </div>
        <div className="grid gap-3 mb-4 sm:grid-cols-2"><HardwareStatus label="Camera" status={camera.status} simulated={mode === 'SIMULATED'} detail={deviceLabel}/><HardwareStatus label="Calibration" status={savedCalibration ? 'SAVED' : 'NOT SAVED'} simulated={mode === 'SIMULATED'} detail="Single region"/></div>
        {camera.error && <Alert type="error">{camera.error}</Alert>}
        <div className="min-w-0">
          <CameraPreview {...camera} mode={mode} videoRef={videoRef} canvasRef={canvasRef}>
            {camera.status === 'READY' && <CalibrationOverlay planes={planes} selectedId={selectedPlaneId} onPlaneChange={updatePlane} onDragEnd={invalidatePreview}/>} 
          </CameraPreview>
          <div className="flex flex-wrap gap-2 mt-3">
            {camera.status !== 'READY'
              ? <Btn variant="secondary" loading={camera.status === 'STARTING'} disabled={camera.status === 'STARTING'} onClick={startCamera}>
                  {mode === 'SIMULATED' ? 'Start Preview' : 'Start Camera'}
                </Btn>
              : mode !== 'SIMULATED' && <Btn variant="secondary" onClick={camera.stop}>Stop Camera</Btn>}
            <Btn variant="secondary" loading={detecting} disabled={camera.status !== 'READY' || detecting} onClick={autoDetect}>Auto Detect Board</Btn>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Add points along the boundary, then drag them to refine the single region. The four canonical anchors remain separate. Coordinates remain normalized across responsive sizes. Arrow keys move precisely; hold Shift for larger steps.</p>
        
        <div className="flex flex-wrap gap-2 mt-4"><Btn disabled={camera.status !== 'READY' || !calibrationValid} loading={saving} onClick={save}>Save Calibration</Btn>{savedCalibration && <Btn variant="ghost" disabled={saving} onClick={cancel}>Cancel</Btn>}<Btn variant="secondary" disabled={camera.status !== 'READY' || !savedCalibration || isDirty} loading={processing} onClick={testCapture}>Preview Corrected Board</Btn></div>
      </>}
      {!editing && <div className="pointer-events-none fixed -left-[10000px] top-0 h-[360px] w-[640px] overflow-hidden opacity-0" aria-hidden="true"><CameraPreview {...camera} mode={mode} videoRef={videoRef} canvasRef={canvasRef}/></div>}
    </Card>
    {originalPreview && <div className="space-y-4" key={`preview-${previewVersion}`}>
      {originalPreview && <Card className="overflow-hidden"><div className="px-4 py-3 text-sm font-semibold border-b border-slate-200 dark:border-white/10">Original Capture</div><img src={originalPreview} alt="Original calibration test" className="max-h-[32rem] w-full bg-slate-950 object-contain"/></Card>}
    </div>}
    <CalibrationImageLightbox inspection={visibleInspection} onClose={() => setInspection(null)}/>
  </div>;
}
