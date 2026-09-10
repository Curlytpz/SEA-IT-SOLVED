import { useEffect,useRef,useState } from 'react';
import { fetchAudioRecording } from '../../services/audioRecordingApi';
import { Alert,LoadingState } from '../ui';

export default function ProtectedAudioPlayer({url,className='',onPlayerReady}){
  const audioRef=useRef(null);
  const [source,setSource]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true,objectUrl='';setSource('');setError('');
    if(url)fetchAudioRecording(url).then(next=>{objectUrl=next;if(active)setSource(next);else URL.revokeObjectURL(next);}).catch(()=>{if(active)setError('Unable to load this protected audio recording.');});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[url]);
  useEffect(()=>{if(source&&audioRef.current)onPlayerReady?.(audioRef.current);return()=>onPlayerReady?.(null);},[source,onPlayerReady]);
  if(error)return <Alert type="error">{error}</Alert>;
  if(!source)return <LoadingState text="Loading protected audio…"/>;
  return <audio ref={audioRef} controls preload="metadata" src={source} className={`w-full ${className}`}>Your browser does not support audio playback.</audio>;
}
