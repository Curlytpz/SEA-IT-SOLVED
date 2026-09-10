import { useCallback, useEffect, useRef, useState } from 'react';
import { getLessonRecognitions } from '../services/recognitionApi';

export default function useRecognitionPolling(lessonId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRef = useRef(true);
  const requestRef = useRef(false);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!lessonId || requestRef.current) return;
    requestRef.current = true;
    if (!quiet) setLoading(true);
    try {
      const next = await getLessonRecognitions(lessonId);
      if (activeRef.current) {
        setData(next);
        setError('');
      }
    } catch (requestError) {
      if (activeRef.current) setError(requestError.response?.data?.error || 'Unable to load whiteboard processing.');
    } finally {
      requestRef.current = false;
      if (activeRef.current && !quiet) setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    activeRef.current = true;
    refresh();
    return () => { activeRef.current = false; };
  }, [refresh]);

  const hasRunningJobs = ['PENDING', 'PROCESSING'].includes(data?.lessonRecognition?.status) || data?.items?.some(item => ['PENDING', 'PROCESSING'].includes(item.recognition?.status));
  useEffect(() => {
    if (!hasRunningJobs) return undefined;
    const timer = window.setInterval(() => refresh({ quiet: true }), 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningJobs, refresh]);

  return { data, loading, error, refresh, hasRunningJobs };
}
