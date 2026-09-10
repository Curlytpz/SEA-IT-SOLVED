import { useEffect, useState } from 'react';
import { fetchCaptureImage } from '../../services/captureApi';
import { LoadingState } from '../ui';

export default function ProtectedCaptureImage({ url, alt, className = '' }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    let active = true, objectUrl = '';
    setSource('');
    if (url) fetchCaptureImage(url).then(next=>{ objectUrl=next; if(active)setSource(next); else URL.revokeObjectURL(next); }).catch(()=>{});
    return () => { active=false; if(objectUrl)URL.revokeObjectURL(objectUrl); };
  }, [url]);
  if (!source) return <LoadingState text="Loading protected capture…"/>;
  return <img src={source} alt={alt} className={className}/>;
}
