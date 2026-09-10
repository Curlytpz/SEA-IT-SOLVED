import { useEffect, useId } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

const SYMBOLS = [
  { value: '∫', left: '8%', top: '18%', duration: 13, delay: 0 },
  { value: 'Σ', left: '82%', top: '13%', duration: 15, delay: 1.5 },
  { value: 'dy/dx', left: '69%', top: '38%', duration: 17, delay: 2.3 },
  { value: 'x²', left: '21%', top: '70%', duration: 14, delay: 3.2 },
  { value: '√', left: '89%', top: '74%', duration: 16, delay: 1 },
  { value: 'f(x)', left: '45%', top: '8%', duration: 18, delay: 4 },
  { value: 'π', left: '38%', top: '84%', duration: 15, delay: 2 },
  { value: 'θ', left: '57%', top: '62%', duration: 17, delay: 3.5 },
  { value: 'α + β', left: '5%', top: '86%', duration: 19, delay: 5 },
];

const OUTER_SYMBOLS = [
  { value: 'π', left: '3%', top: '15%', duration: 23, delay: 0 },
  { value: 'Σ', left: '93%', top: '13%', duration: 25, delay: 2 },
  { value: '√x', left: '2%', top: '62%', duration: 27, delay: 4 },
  { value: 'dy/dx', left: '90%', top: '67%', duration: 24, delay: 1 },
  { value: 'x²', left: '15%', top: '92%', duration: 26, delay: 3 },
  { value: '∫', left: '82%', top: '93%', duration: 28, delay: 5 },
  { value: 'a² + b² = c²', left: '46%', top: '3%', duration: 29, delay: 2.5 },
];

export default function AmbientMathScene({ compact = false, restrained = false, symbolsOnly = false, outer = false, interactive = true }) {
  const reducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 48, damping: 24, mass: 0.78, restDelta: 0.0005 });
  const smoothY = useSpring(pointerY, { stiffness: 48, damping: 24, mass: 0.78, restDelta: 0.0005 });
  const sceneX = useTransform(smoothX, [-0.5, 0.5], outer ? [-7, 7] : restrained ? [-4, 4] : [-12, 12]);
  const sceneY = useTransform(smoothY, [-0.5, 0.5], outer ? [-5, 5] : restrained ? [-3, 3] : [-8, 8]);
  const gradientId = useId().replaceAll(':', '');
  const visibleSymbols = outer ? OUTER_SYMBOLS : restrained ? SYMBOLS.slice(0, 5) : SYMBOLS;

  useEffect(() => {
    const pointerQuery = window.matchMedia(outer
      ? '(min-width: 1024px) and (hover: hover) and (pointer: fine)'
      : '(hover: hover) and (pointer: fine)');
    if (!interactive || reducedMotion || !pointerQuery.matches) return undefined;

    const move = event => {
      pointerX.set(event.clientX / window.innerWidth - 0.5);
      pointerY.set(event.clientY / window.innerHeight - 0.5);
    };
    const reset = () => {
      pointerX.set(0);
      pointerY.set(0);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', reset);
    };
  }, [interactive, outer, pointerX, pointerY, reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className={`landing-ambient ${compact ? 'landing-ambient-compact' : ''} ${restrained ? 'landing-ambient-restrained' : ''} ${outer ? 'landing-ambient-outer' : ''}`}
    >
      <motion.div className="landing-ambient-layer" style={reducedMotion ? undefined : { x: sceneX, y: sceneY }}>
        {!symbolsOnly && <svg className="landing-ambient-curve" viewBox="0 0 900 560" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0" />
              <stop offset="0.42" stopColor="hsl(var(--primary))" stopOpacity={restrained ? '0.34' : '0.55'} />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d="M0 410 C140 395 188 142 320 204 S478 505 610 305 S765 100 900 154"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.5"
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={reducedMotion
              ? { pathLength: 1, opacity: restrained ? 0.62 : 1 }
              : { pathLength: 1, opacity: restrained ? [0.5, 0.68, 0.5] : 1 }}
            transition={restrained
              ? { pathLength: { duration: 1.2, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 11, repeat: Infinity, ease: 'easeInOut' } }
              : { duration: 1.4, ease: 'easeOut' }}
          />
        </svg>}

        {visibleSymbols.map((symbol, index) => (
          <motion.span
            key={`${symbol.value}-${index}`}
            className="landing-ambient-symbol"
            style={{ left: symbol.left, top: symbol.top }}
            animate={reducedMotion
              ? { opacity: outer ? ([0, 3, 5].includes(index) ? 0.25 : 0.18) : restrained ? 0.055 : 0.12 }
              : {
                  y: restrained ? [0, -2, 0] : [0, -7, 0],
                  opacity: outer
                    ? ([0, 3, 5].includes(index) ? [0.24, 0.28, 0.24] : [0.16, 0.22, 0.16])
                    : restrained ? [0.035, 0.075, 0.035] : [0.12, 0.2, 0.12],
                }}
            transition={{ repeat: Infinity, duration: restrained ? symbol.duration + 5 : symbol.duration, delay: symbol.delay, ease: 'easeInOut' }}
          >
            {symbol.value}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}
