import { useCallback, useEffect, useRef, useState } from 'react';
import { getLessonTranscription } from '../services/transcriptionApi';

export default function useTranscriptionPolling(lessonId) {
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
      const next = await getLessonTranscription(lessonId);
      if (activeRef.current) { setData(next); setError(''); }
    } catch (requestError) {
      if (activeRef.current) setError(requestError.response?.data?.error || 'Unable to load the audio transcript.');
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

  const running = ['PENDING', 'PROCESSING'].includes(data?.transcription?.status);
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => refresh({ quiet: true }), 5000);
    return () => window.clearInterval(timer);
  }, [running, refresh]);

  return { data, loading, error, refresh, running };
}
