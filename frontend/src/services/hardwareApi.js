import api from './api';

export async function getHardwareSettings() {
  const { data } = await api.get('/hardware/settings');
  return data.data.settings;
}

export async function saveHardwareSettings(settings) {
  const { data } = await api.patch('/hardware/settings', settings);
  return data.data.settings;
}

export async function getCalibrations() {
  const { data } = await api.get('/hardware/camera/calibrations', { params: { _v: Date.now() }, headers: { 'Cache-Control': 'no-cache' } });
  return data.data.calibrations;
}

export async function getCalibration(sourceKey) {
  const { data } = await api.get('/hardware/camera/calibrations/' + encodeURIComponent(sourceKey), {
    params: { _v: Date.now() },
    headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
  });
  return data.data.calibration;
}

export async function saveCalibration(calibration) {
  const { data } = await api.put('/hardware/camera/calibrations', calibration, {
    headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
  });
  return data.data.calibration;
}

export async function deleteCalibration(id) {
  await api.delete(`/hardware/camera/calibrations/${id}`);
}

