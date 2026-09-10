import { useEffect } from 'react';
import Lenis from 'lenis';

export function useSmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis;
    let frameId;

    const stop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = undefined;
      lenis?.destroy();
      lenis = undefined;
    };

    const start = () => {
      stop();
      if (reducedMotion.matches) return;

      lenis = new Lenis({
        duration: 1.3,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      const raf = time => {
        lenis?.raf(time);
        frameId = requestAnimationFrame(raf);
      };

      frameId = requestAnimationFrame(raf);
    };

    start();
    reducedMotion.addEventListener('change', start);

    return () => {
      reducedMotion.removeEventListener('change', start);
      stop();
    };
  }, []);
}
