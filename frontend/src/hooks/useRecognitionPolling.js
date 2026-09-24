import { useCallback, useEffect, useRef, useState } from 'react';
import { getLessonRecognitions } from '../services/recognitionApi';

export default function useRecognitionPolling(lessonId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRef = useRef(true);
  const requestRef = useRef(null);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!lessonId || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    if (!quiet) setLoading(true);
    try {
      const next = await getLessonRecognitions(lessonId, { signal: controller.signal });
      if (activeRef.current) {
        setData(next);
        setError('');
      }
    } catch (requestError) {
      if (activeRef.current && requestError.code !== 'ERR_CANCELED') setError(requestError.response?.data?.error || 'Unable to load whiteboard processing.');
    } finally {
      const isCurrent = requestRef.current === controller;
      if (isCurrent) requestRef.current = null;
      if (isCurrent && activeRef.current && !quiet) setLoading(false);
    }
  }, [lessonId]);

  const updateCaptureRecognition = useCallback((captureId, recognition) => {
    setData(current => current ? {
      ...current,
      items: current.items.map(item => item.capture.id === captureId ? { ...item, recognition } : item),
    } : current);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    refresh();
    return () => { activeRef.current = false; requestRef.current?.abort(); requestRef.current = null; };
  }, [refresh]);

  const hasRunningJobs = ['PENDING', 'PROCESSING'].includes(data?.lessonRecognition?.status) || data?.items?.some(item => ['PENDING', 'PROCESSING'].includes(item.recognition?.status));
  useEffect(() => {
    if (!hasRunningJobs) return undefined;
    const timer = window.setInterval(() => refresh({ quiet: true }), 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningJobs, refresh]);

  return { data, loading, error, refresh, hasRunningJobs, updateCaptureRecognition };
}
