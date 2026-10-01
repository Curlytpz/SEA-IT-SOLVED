import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import CameraCalibrationPanel from '../../components/hardware/CameraCalibrationPanel';
import MicrophoneSettingsPanel from '../../components/hardware/MicrophoneSettingsPanel';
import LightingSettingsPanel from '../../components/hardware/LightingSettingsPanel';
import { getCalibrations, getHardwareSettings } from '../../services/hardwareApi';
import { hardwareSettingsLoadError, remainingSkeletonDuration } from '../../utils/hardwareSettingsHydration';
import { Alert, BackButton, Btn, PageHeader, Skeleton } from '../../components/ui';

function validLessonReturnPath(value) {
  return typeof value === 'string' && new RegExp('^/instructor/lessons/[^/?#]+/active(?:[?#].*)?$').test(value);
}

function HardwareSettingsSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading hardware settings" className="space-y-8">
      <span className="sr-only">Loading saved hardware settings…</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-8 w-56 max-w-[72%]" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {[0, 1, 2].map(card => (
        <div key={card} aria-hidden="true" className="rounded-xl border border-border bg-surface p-5 shadow-surface">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-3 w-72 max-w-full" /></div>
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
          <div className="mt-4 flex gap-2"><Skeleton className="h-10 w-36" /><Skeleton className="h-10 w-28" /></div>
        </div>
      ))}
    </div>
  );
}

export default function InstructorSettings() {
  const location = useLocation();
  const requestedReturn = location.state?.fromLesson ? location.state.returnTo : '';
  const returnTo = validLessonReturnPath(requestedReturn) ? requestedReturn : '';
  const [hydrated, setHydrated] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const retryTimerRef = useRef(null);

  const load = useCallback(async () => {
    clearTimeout(retryTimerRef.current);
    const startedAt = Date.now();
    setLoading(true);
    setLoadError('');
    try {
      const [settings, calibrations] = await Promise.all([getHardwareSettings(), getCalibrations()]);
      const finish = () => {
        setHydrated({ settings, calibrations });
        setLoading(false);
      };
      const remaining = remainingSkeletonDuration(startedAt);
      if (remaining) retryTimerRef.current = setTimeout(finish, remaining);
      else finish();
    } catch (error) {
      setHydrated(null);
      setLoadError(hardwareSettingsLoadError(error));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => clearTimeout(retryTimerRef.current);
  }, [load]);

  return (
    <DashboardLayout>
      <main aria-busy={loading || undefined}>
        {loading ? <HardwareSettingsSkeleton/> : loadError ? <>
          <PageHeader title="Hardware Settings" subtitle="Configure classroom camera, lighting, and optional lesson audio recording.">
            {returnTo&&<BackButton to={returnTo} className="mb-0">Back to Lesson</BackButton>}
          </PageHeader>
          <Alert type="error" actions={<Btn variant="secondary" onClick={load}>Retry</Btn>}>{loadError}</Alert>
        </> : <>
          <PageHeader title="Hardware Settings" subtitle="Configure classroom camera, lighting, and optional lesson audio recording.">
            {returnTo&&<BackButton to={returnTo} className="mb-0">Back to Lesson</BackButton>}
          </PageHeader>
          <CameraCalibrationPanel initialHardwareSettings={hydrated.settings} initialCalibrations={hydrated.calibrations}/>
          <div className="my-8 border-t border-border dark:border-border"/>
          <LightingSettingsPanel initialHardwareSettings={hydrated.settings}/>
          <div className="my-8 border-t border-border dark:border-border"/>
          <MicrophoneSettingsPanel initialHardwareSettings={hydrated.settings}/>
        </>}
      </main>
    </DashboardLayout>
  );
}
