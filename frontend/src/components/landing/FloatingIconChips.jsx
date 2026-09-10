import { useEffect } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { BrainCircuit, Camera, ClipboardCheck, GraduationCap } from 'lucide-react';

const CHIPS = [
  { Icon: Camera, top: '14%', left: '4%', duration: 5.5, delay: 0 },
  { Icon: ClipboardCheck, top: '66%', left: '8%', duration: 6.5, delay: 0.5 },
  { Icon: BrainCircuit, top: '20%', left: '93%', duration: 6, delay: 0.3 },
  { Icon: GraduationCap, top: '72%', left: '90%', duration: 7, delay: 0.9 },
];

export default function FloatingIconChips() {
  const reducedMotion = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 20 });
  const sy = useSpring(py, { stiffness: 60, damping: 20 });
  const x = useTransform(sx, [-0.5, 0.5], [-20, 20]);
  const y = useTransform(sy, [-0.5, 0.5], [-16, 16]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const move = event => {
      px.set(event.clientX / window.innerWidth - 0.5);
      py.set(event.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [px, py, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] hidden lg:block">
      {CHIPS.map(({ Icon, top, left, duration, delay }, i) => (
        // Cursor parallax lives on the outer element, the idle bob lives on the
        // inner one — keeping both on separate nodes avoids the two motion
        // systems fighting over the same transform property.
        <motion.div key={i} style={{ top, left, x, y }} className="absolute">
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ repeat: Infinity, duration, delay, ease: 'easeInOut' }}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary shadow-[0_14px_34px_-14px_hsl(var(--primary)/0.55)] backdrop-blur-sm"
          >
            <Icon size={18} />
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
