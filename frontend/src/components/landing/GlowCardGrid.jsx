// src/components/landing/GlowCardGrid.jsx
import { useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Wraps a grid of cards and tracks pointer position across
 * the whole grid — gives the synchronized glow effect mckp uses
 * where hovering near a card edge glows both cards.
 */
export default function GlowCardGrid({ children, className = '', ...props }) {
  const gridRef = useRef(null);
  const reducedMotion = useReducedMotion();

  const handlePointerMove = (e) => {
    if (reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const cards = gridRef.current?.querySelectorAll('.glow-card');
    if (!cards) return;
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  };

  const handlePointerLeave = () => {
    const cards = gridRef.current?.querySelectorAll('.glow-card');
    if (!cards) return;
    cards.forEach((card) => {
      card.style.setProperty('--mouse-x', `-999px`);
      card.style.setProperty('--mouse-y', `-999px`);
    });
  };

  return (
    <div
      ref={gridRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}
