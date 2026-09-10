// src/components/landing/GlowCard.jsx
import { useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const TONES = {
  dark: 'border-white/[0.08] bg-card',
  light: 'border-border bg-card',
  transparent: 'border-white/[0.08] bg-transparent',
};

export default function GlowCard({
  children,
  className = '',
  contentClassName = '',
  tone = 'dark',
  tilt = false,
  trackPointer = true,
  ...props
}) {
  const cardRef = useRef(null);
  const reducedMotion = useReducedMotion();

  const handlePointerMove = (e) => {
    const card = cardRef.current;
    if (!card || !trackPointer || reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);

    if (tilt) {
      const normalizedX = x / rect.width - 0.5;
      const normalizedY = y / rect.height - 0.5;
      card.style.setProperty('--glow-rotate-x', `${normalizedY * -1.6}deg`);
      card.style.setProperty('--glow-rotate-y', `${normalizedX * 1.9}deg`);
    }
  };

  const handlePointerLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--mouse-x', `-999px`);
    card.style.setProperty('--mouse-y', `-999px`);
    card.style.setProperty('--glow-rotate-x', '0deg');
    card.style.setProperty('--glow-rotate-y', '0deg');
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-tilt={tilt ? 'true' : 'false'}
      data-tone={tone}
      className={`glow-card relative overflow-hidden rounded-2xl border ${TONES[tone] || TONES.dark} ${className}`}
      {...props}
    >
      <div className="glow-card-border" aria-hidden="true" />
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}
