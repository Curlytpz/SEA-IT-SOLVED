import { useEffect, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

export default function CustomCursor() {
  const reducedMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });

  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const isEnabled = query.matches && !reducedMotion;
    setEnabled(isEnabled);
    if (isEnabled) document.body.style.cursor = 'none';

    const move = event => {
      x.set(event.clientX);
      y.set(event.clientY);
      const target = event.target.closest('a, button, [role="tab"], [role="button"]');
      setHovering(Boolean(target));
    };

    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      document.body.style.cursor = '';
    };
  }, [x, y, reducedMotion]);

  if (reducedMotion || !enabled) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[999] mix-blend-difference"
      style={{ x: springX, y: springY, translateX: '-50%', translateY: '-50%' }}
    >
      <motion.div
        animate={{ scale: hovering ? 2.6 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="w-3 h-3 bg-white rounded-full"
      />
      <motion.div
        animate={{ scale: hovering ? 1.4 : 0, opacity: hovering ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="absolute -translate-x-1/2 -translate-y-1/2 border rounded-full left-1/2 top-1/2 h-9 w-9 border-white/60"
      />
    </motion.div>
  );
}