import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const STATE_TONES = {
  idle: '#149E91',
  thinking: '#0D9488',
  responding: '#149E91',
  done: '#059669',
  error: '#dc2626',
};

const SIZE_CLASS = {
  sm: 'is-small',
  md: 'is-medium',
  lg: 'is-large',
};

export default function AiAssistantAvatar({ state = 'idle', size = 'md', className = '' }) {
  const gradientId = useId().replaceAll(':', '');
  const reducedMotion = useReducedMotion();
  const tone = STATE_TONES[state] || STATE_TONES.idle;
  const active = state === 'thinking' || state === 'responding';

  const shellAnimation = reducedMotion ? undefined : state === 'thinking'
    ? { scale: [1, 1.035, 1], rotate: [0, -0.8, 0.8, 0] }
    : state === 'responding'
      ? { scale: [1, 1.025, 1], y: [0, -1, 0] }
      : state === 'done'
        ? { scale: [1, 1.08, 1] }
        : state === 'error'
          ? { x: [0, -1.5, 1.5, 0] }
          : { scale: [1, 1.018, 1] };
  const shellTransition = reducedMotion ? undefined : {
    duration: state === 'done' || state === 'error' ? 0.45 : state === 'idle' ? 4.2 : 1.35,
    repeat: ['idle', 'thinking', 'responding'].includes(state) ? Infinity : 0,
    ease: 'easeInOut',
  };
  const eyeAnimation = reducedMotion ? undefined : state === 'thinking'
    ? { opacity: [1, 0.42, 1], scale: [1, 0.82, 1] }
    : state === 'responding'
      ? { x: [0, 1.2, 0] }
      : state === 'idle'
        ? { scaleY: [1, 1, 0.12, 1, 1] }
        : undefined;
  const eyeTransition = reducedMotion ? undefined : {
    duration: state === 'idle' ? 4.8 : 1.05,
    times: state === 'idle' ? [0, 0.42, 0.45, 0.49, 1] : undefined,
    repeat: ['idle', 'thinking', 'responding'].includes(state) ? Infinity : 0,
    ease: 'easeInOut',
  };

  return <motion.span
    className={`ai-assistant-avatar ${SIZE_CLASS[size] || SIZE_CLASS.md} is-${state} ${className}`}
    animate={shellAnimation}
    transition={shellTransition}
    aria-hidden="true"
  >
    <svg viewBox="0 0 44 44" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="8" y1="5" x2="36" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EEAD4"/>
          <stop offset="1" stopColor={tone}/>
        </linearGradient>
      </defs>
      <path d="M22 3.7 36.7 12v16L22 36.3 7.3 28V12L22 3.7Z" fill={`url(#${gradientId})`}/>
      <path d="M22 8.3 32.8 14.4v12.1L22 32.7l-10.8-6.2V14.4L22 8.3Z" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.28)" strokeWidth="1"/>
      <motion.g animate={eyeAnimation} transition={eyeTransition} style={{ transformOrigin: '22px 20px' }}>
        <rect x="15" y="18" width="4.7" height="4.2" rx="2.1" fill="white"/>
        <rect x="24.3" y="18" width="4.7" height="4.2" rx="2.1" fill="white"/>
      </motion.g>
    </svg>
    <motion.i
      animate={reducedMotion || !active ? undefined : { scale: [1, 1.35, 1], opacity: [0.82, 1, 0.82] }}
      transition={reducedMotion ? undefined : { duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
      style={{ backgroundColor: tone }}
    />
  </motion.span>;
}
