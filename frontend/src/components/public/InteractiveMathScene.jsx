import { useEffect, useRef } from 'react';

const SYMBOLS = [
  { value: '∫', x: 9, y: 18, depth: 1.2, delay: -2 },
  { value: 'Σ', x: 82, y: 14, depth: .8, delay: -6 },
  { value: 'dy/dx', x: 68, y: 35, depth: 1.05, delay: -4 },
  { value: 'x²', x: 22, y: 68, depth: .75, delay: -8 },
  { value: '√', x: 88, y: 72, depth: 1.2, delay: -1 },
  { value: 'f(x)', x: 46, y: 9, depth: .7, delay: -7 },
  { value: 'π', x: 38, y: 84, depth: 1.1, delay: -3 },
  { value: 'θ', x: 57, y: 63, depth: .85, delay: -5 },
  { value: '[ a  b ]', x: 7, y: 87, depth: .55, delay: -9 },
];

export default function InteractiveMathScene({ compact = false, className = '' }) {
  const sceneRef = useRef(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!pointer.matches || reduced.matches) return undefined;
    let frame = 0;
    const move = event => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = scene.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - .5) * 2;
        const y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - .5) * 2;
        scene.style.setProperty('--math-pointer-x', x.toFixed(3));
        scene.style.setProperty('--math-pointer-y', y.toFixed(3));
      });
    };
    const leave = () => {
      scene.style.setProperty('--math-pointer-x', '0');
      scene.style.setProperty('--math-pointer-y', '0');
    };
    scene.addEventListener('pointermove', move, { passive: true });
    scene.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      scene.removeEventListener('pointermove', move);
      scene.removeEventListener('pointerleave', leave);
    };
  }, []);

  return <div ref={sceneRef} className={`interactive-math-scene ${compact ? 'is-compact' : ''} ${className}`} aria-hidden="true">
    <svg className="math-scene-graph" viewBox="0 0 800 560" preserveAspectRatio="none">
      <defs><linearGradient id="curve-stroke" x1="0" x2="1"><stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0"/><stop offset=".3" stopColor="hsl(var(--primary))"/><stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0"/></linearGradient></defs>
      <path d="M0 420 C125 390 170 150 292 198 S445 510 560 320 S690 105 800 142" fill="none" stroke="url(#curve-stroke)" strokeWidth="2"/>
      <path d="M0 330 C180 250 230 460 402 315 S640 210 800 276" fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="1"/>
    </svg>
    <div className="math-scene-axis math-scene-axis-x"/><div className="math-scene-axis math-scene-axis-y"/>
    {SYMBOLS.map((symbol, index) => <span key={`${symbol.value}-${index}`} className="math-scene-symbol" style={{ left: `${symbol.x}%`, top: `${symbol.y}%`, '--depth': symbol.depth, '--delay': `${symbol.delay}s` }}>{symbol.value}</span>)}
  </div>;
}
