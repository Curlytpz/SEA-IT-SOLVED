import { useCallback, useEffect, useMemo, useState } from 'react';
import CameraService from '../hardware/camera/CameraService';

export default function useCamera(mode) {
  const service = useMemo(() => new CameraService(mode), [mode]);
  const [devices, setDevices] = useState([]);
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState('STOPPED');
  const [error, setError] = useState('');

  const refreshDevices = useCallback(async () => {
    try { const found = await service.listDevices(); setDevices(found); setError(''); return found; }
    catch (err) { setError(err.message); setDevices([]); return []; }
  }, [service]);

  const start = useCallback(async deviceId => {
    setStatus('STARTING'); setError('');
    try {
      const nextStream = await service.start({ deviceId });
      setStream(nextStream); setStatus('READY');
      await refreshDevices();
    } catch (err) { setStatus('ERROR'); setError(err.message || 'Unable to start camera.'); throw err; }
  }, [service, refreshDevices]);

  const stop = useCallback(() => {
    service.stop(); setStream(null); setStatus('STOPPED');
  }, [service]);

  useEffect(() => { refreshDevices(); return () => service.stop(); }, [service, refreshDevices]);

  return { service, devices, stream, status, error, refreshDevices, start, stop };
}
