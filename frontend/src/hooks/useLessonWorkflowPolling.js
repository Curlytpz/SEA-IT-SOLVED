import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import { lessonContextReadiness } from '../utils/lessonContextReadiness';

const POLL_INTERVAL_MS = 5000;
const MAX_AUTOMATIC_POLLS = 120;

export default function useLessonWorkflowPolling(lessonId, { enabled = true } = {}) {
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const activeRef = useRef(false);
  const requestRef = useRef(false);
  const pollCountRef = useRef(0);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!lessonId || requestRef.current) return null;
    requestRef.current = true;
    if (!quiet && activeRef.current) setLoading(true);
    try {
      const response = await api.get(`/lessons/${lessonId}`);
      const next = response.data.data.lesson;
      if (activeRef.current) {
        setLesson(next);
        setError('');
      }
      return next;
    } catch (requestError) {
      if (activeRef.current) setError(requestError.response?.data?.error || 'Unable to check lesson processing status.');
      return null;
    } finally {
      requestRef.current = false;
      if (!quiet && activeRef.current) setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    activeRef.current = true;
    pollCountRef.current = 0;
    setPollingTimedOut(false);
    refresh();
    return () => { activeRef.current = false; };
  }, [refresh]);

  const readiness = useMemo(() => lessonContextReadiness(lesson), [lesson]);

  useEffect(() => {
    if (!enabled || !readiness.processing) {
      pollCountRef.current = 0;
      setPollingTimedOut(false);
      return undefined;
    }
    const timer = window.setInterval(async () => {
      if (pollCountRef.current >= MAX_AUTOMATIC_POLLS) {
        window.clearInterval(timer);
        if (activeRef.current) setPollingTimedOut(true);
        return;
      }
      pollCountRef.current += 1;
      await refresh({ quiet: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, readiness.processing, refresh]);

  const retry = useCallback(async () => {
    pollCountRef.current = 0;
    setPollingTimedOut(false);
    return refresh();
  }, [refresh]);

  return { lesson, loading, error, pollingTimedOut, readiness, refresh, retry };
}

