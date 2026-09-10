import { useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import CameraCalibrationPanel from '../../components/hardware/CameraCalibrationPanel';
import MicrophoneSettingsPanel from '../../components/hardware/MicrophoneSettingsPanel';
import LightingSettingsPanel from '../../components/hardware/LightingSettingsPanel';
import { Btn, PageHeader } from '../../components/ui';
import { ArrowLeft } from '../../components/icons';

function validLessonReturnPath(value) {
  return typeof value === 'string' && new RegExp('^/instructor/lessons/[^/?#]+/active(?:[?#].*)?$').test(value);
}

export default function InstructorSettings() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedReturn = location.state?.fromLesson ? location.state.returnTo : '';
  const returnTo = validLessonReturnPath(requestedReturn) ? requestedReturn : '';
  const backToLesson = returnTo ? () => navigate(returnTo) : null;

  return (
    <DashboardLayout>
      <PageHeader title="Hardware Settings" subtitle="Configure classroom camera, lighting, and optional lesson audio recording.">
        {backToLesson&&<Btn variant="ghost" size="sm" onClick={backToLesson}><ArrowLeft size={15}/> Back to Lesson</Btn>}
      </PageHeader>
      <CameraCalibrationPanel/>
      <div className="my-8 border-t border-slate-200 dark:border-white/10"/>
      <LightingSettingsPanel/>
      <div className="my-8 border-t border-slate-200 dark:border-white/10"/>
      <MicrophoneSettingsPanel/>
    </DashboardLayout>
  );
}
