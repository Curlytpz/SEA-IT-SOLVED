import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import CameraCalibrationPanel from '../../components/hardware/CameraCalibrationPanel';
import MicrophoneSettingsPanel from '../../components/hardware/MicrophoneSettingsPanel';
import LightingSettingsPanel from '../../components/hardware/LightingSettingsPanel';
import { BackButton, PageHeader } from '../../components/ui';

function validLessonReturnPath(value) {
  return typeof value === 'string' && new RegExp('^/instructor/lessons/[^/?#]+/active(?:[?#].*)?$').test(value);
}

export default function InstructorSettings() {
  const location = useLocation();
  const requestedReturn = location.state?.fromLesson ? location.state.returnTo : '';
  const returnTo = validLessonReturnPath(requestedReturn) ? requestedReturn : '';

  return (
    <DashboardLayout>
      <PageHeader title="Hardware Settings" subtitle="Configure classroom camera, lighting, and optional lesson audio recording.">
        {returnTo&&<BackButton to={returnTo} className="mb-0">Back to Lesson</BackButton>}
      </PageHeader>
      <CameraCalibrationPanel/>
      <div className="my-8 border-t border-border dark:border-border"/>
      <LightingSettingsPanel/>
      <div className="my-8 border-t border-border dark:border-border"/>
      <MicrophoneSettingsPanel/>
    </DashboardLayout>
  );
}
