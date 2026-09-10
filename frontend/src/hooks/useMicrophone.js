import { useCallback, useEffect, useMemo, useState } from 'react';
import MicrophoneService from '../hardware/microphone/MicrophoneService';

export default function useMicrophone(mode) {
  const service=useMemo(()=>new MicrophoneService(mode),[mode]);
  const [devices,setDevices]=useState([]);
  const [status,setStatus]=useState('STOPPED');
  const [error,setError]=useState('');
  const [noiseSuppression,setNoiseSuppressionState]=useState(()=>service.getNoiseSuppressionState());

  const syncStatus=useCallback(()=>{const next=service.getStatus();setStatus(next);setNoiseSuppressionState(service.getNoiseSuppressionState());if(next==='ERROR')setError(service.getError()||'The microphone was disconnected.');},[service]);
  const refreshDevices=useCallback(async()=>{try{const found=await service.listDevices();setDevices(found);setError('');return found;}catch(err){setDevices([]);setError(err.message||'Unable to detect microphones.');return [];}},[service]);
  const requestPermission=useCallback(async()=>{setStatus('REQUESTING_PERMISSION');setError('');try{const found=await service.requestPermission();setDevices(found);setStatus('STOPPED');return found;}catch(err){setStatus('ERROR');setError(err.message);throw err;}},[service]);
  const start=useCallback(async(deviceId,options={})=>{setStatus('STARTING');setError('');try{await service.start({deviceId,...options});syncStatus();await refreshDevices();}catch(err){setStatus('ERROR');setError(err.message);throw err;}},[service,syncStatus,refreshDevices]);
  const stop=useCallback(()=>{service.stop();syncStatus();},[service,syncStatus]);
  const startRecording=useCallback(()=>{service.startRecording();syncStatus();},[service,syncStatus]);
  const pauseRecording=useCallback(()=>{service.pauseRecording();syncStatus();},[service,syncStatus]);
  const resumeRecording=useCallback(()=>{service.resumeRecording();syncStatus();},[service,syncStatus]);
  const stopRecording=useCallback(async()=>{try{return await service.stopRecording();}finally{syncStatus();}},[service,syncStatus]);
  const setNoiseSuppression=useCallback(async enabled=>{try{const result=await service.setNoiseSuppression(enabled);setNoiseSuppressionState(result);setError('');return result;}catch(err){setError(err.message);throw err;}},[service]);

  useEffect(()=>{refreshDevices();return()=>service.stop();},[service,refreshDevices]);
  useEffect(()=>{const timer=setInterval(syncStatus,500);return()=>clearInterval(timer);},[syncStatus]);
  return {service,devices,status,error,noiseSuppression,refreshDevices,requestPermission,start,stop,startRecording,pauseRecording,resumeRecording,stopRecording,setNoiseSuppression};
}