import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui';
import { readCapsLockState } from '../../utils/capsLock';
import { togglePasswordVisibility } from '../../utils/passwordVisibility';

export default function AuthPasswordInput({ className = '', onBlur, onFocus, onKeyDown, onKeyUp, ...props }) {
  const [focused, setFocused] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [visible, setVisible] = useState(false);

  const updateCapsLock = event => setCapsLockOn(readCapsLockState(event));
  const warningVisible = focused && capsLockOn;

  const input = <Input
    {...props}
    type={visible ? 'text' : 'password'}
    className={`pr-11 ${className}`.trim()}
    onFocus={event => {
      setFocused(true);
      updateCapsLock(event);
      onFocus?.(event);
    }}
    onBlur={event => {
      setFocused(false);
      setCapsLockOn(false);
      onBlur?.(event);
    }}
    onKeyDown={event => {
      updateCapsLock(event);
      onKeyDown?.(event);
    }}
    onKeyUp={event => {
      updateCapsLock(event);
      onKeyUp?.(event);
    }}
  />;

  return <div>
    <div className="relative">
      {input}
      <button
        type="button"
        onClick={() => setVisible(togglePasswordVisibility)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}
      </button>
    </div>
    <div aria-live="polite" aria-atomic="true">
      {warningVisible && <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warning-subtle-foreground" role="status">
        <AlertTriangle size={13} aria-hidden="true"/>
        Caps Lock is on
      </p>}
    </div>
  </div>;
}
