import { useId, useRef } from 'react';
import { useLandingGsap } from './animation/useLandingAnimations';

const WAVES = [
  {
    key: 'middle',
    path: 'M-320 500 C70 694 420 326 760 516 C1100 706 1400 690 1720 494 C2040 298 2370 306 2720 500',
    alternate: 'M-320 466 C78 582 420 388 742 554 C1064 720 1420 648 1750 452 C2080 256 2385 350 2720 466',
    mobileAlternate: 'M-320 483 C74 616 420 357 751 535 C1082 713 1410 669 1735 473 C2060 277 2378 328 2720 483',
    duration: 29,
    parallax: 60,
    blur: 13,
    colors: ['#064b45', '#11a596', '#65e0cd'],
  },
  {
    key: 'near',
    path: 'M-320 790 C34 1026 392 596 730 758 C1068 920 1410 934 1742 734 C2074 534 2390 554 2720 790',
    alternate: 'M-320 742 C44 868 410 650 752 798 C1094 946 1430 880 1760 688 C2090 496 2394 616 2720 742',
    mobileAlternate: 'M-320 766 C39 900 401 623 741 778 C1081 933 1420 907 1751 711 C2082 515 2392 585 2720 766',
    duration: 23,
    parallax: 84,
    blur: 10,
    colors: ['#075a52', '#17b8a6', '#8aead8'],
  },
];

export default function WaveBackground({ compact = false, interactive = false }) {
  const rootRef = useRef(null);
  const idPrefix = useId().replaceAll(':', '');

  useLandingGsap(rootRef, ({ gsap, desktop, mobile, reduce }) => {
    const root = rootRef.current;
    const waves = gsap.utils.toArray('[data-wave]', root);

    if (reduce) {
      gsap.set(root.querySelectorAll('[data-wave-parallax], [data-wave-pointer], [data-wave-drift]'), { clearProps: 'transform' });
      return undefined;
    }

    waves.forEach((wave, index) => {
      const settings = WAVES[index];
      const drift = wave.querySelector('[data-wave-drift]');
      const parallax = wave.querySelector('[data-wave-parallax]');
      const shape = root.querySelector(`[data-wave-shape="${settings.key}"]`);
      gsap.fromTo(drift, {
        x: 0,
      }, {
        x: -3040,
        duration: settings.duration + (mobile ? 4 : 0),
        repeat: -1,
        ease: 'none',
      });

      const deformationStep = (settings.duration + (mobile ? 4 : 0)) / 2;
      gsap.timeline({ repeat: -1 })
        .to(shape, {
          attr: { d: mobile ? settings.mobileAlternate : settings.alternate },
          duration: deformationStep,
          ease: 'sine.inOut',
        })
        .to(shape, {
          attr: { d: settings.path },
          duration: deformationStep,
          ease: 'sine.inOut',
        });

      gsap.to(parallax, {
        y: settings.parallax * (mobile ? 0.38 : 1),
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top bottom',
          end: 'bottom top',
          scrub: desktop ? 1.2 : 1.6,
        },
      });
    });

    if (!desktop || !interactive) return undefined;

    const pointerLayer = root.querySelector('[data-wave="near"] [data-wave-pointer]');
    const moveX = gsap.quickTo(pointerLayer, 'x', { duration: 1.4, ease: 'power3.out' });
    const moveY = gsap.quickTo(pointerLayer, 'y', { duration: 1.4, ease: 'power3.out' });

    const handlePointerMove = event => {
      const bounds = root.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom;

      if (!inside) {
        moveX(0);
        moveY(0);
        return;
      }

      moveX(((event.clientX - bounds.left) / bounds.width - 0.5) * 18);
      moveY(((event.clientY - bounds.top) / bounds.height - 0.5) * 10);
    };

    const resetPointer = () => {
      moveX(0);
      moveY(0);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', resetPointer);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', resetPointer);
    };
  }, [compact, interactive]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`landing-wave-background${compact ? ' is-compact' : ''}`}
    >
      <svg className="landing-wave-canvas" viewBox="0 0 2400 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          {WAVES.map((wave, index) => (
            <linearGradient key={`gradient-${wave.key}`} id={`${idPrefix}-wave-gradient-${wave.key}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={wave.colors[0]} stopOpacity="0" />
              <stop offset="0.16" stopColor={wave.colors[0]} stopOpacity="0.42" />
              <stop offset="0.48" stopColor={wave.colors[1]} stopOpacity="0.92" />
              <stop offset="0.76" stopColor={wave.colors[2]} stopOpacity="0.62" />
              <stop offset="1" stopColor={wave.colors[2]} stopOpacity="0" />
            </linearGradient>
          ))}
          {WAVES.map((wave, index) => (
            <filter
              key={`filter-${wave.key}`}
              id={`${idPrefix}-wave-filter-${wave.key}`}
              x="-18%"
              y="-45%"
              width="136%"
              height="190%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence type="fractalNoise" baseFrequency="0.003 0.021" numOctaves="2" seed={index + 7} result="waveNoise" />
              <feDisplacementMap in="SourceGraphic" in2="waveNoise" scale={wave.key === 'near' ? 8 : 10} xChannelSelector="R" yChannelSelector="G" result="texturedWave" />
              <feGaussianBlur in="texturedWave" stdDeviation={`${wave.blur} ${Math.round(wave.blur * 0.72)}`} />
            </filter>
          ))}
          {WAVES.map(wave => (
            <path key={`shape-${wave.key}`} data-wave-shape={wave.key} id={`${idPrefix}-wave-shape-${wave.key}`} d={wave.path} />
          ))}
        </defs>

        {WAVES.map(wave => (
          <g
            key={wave.key}
            data-wave={wave.key}
            className={`landing-wave landing-wave--${wave.key}`}
            filter={`url(#${idPrefix}-wave-filter-${wave.key})`}
          >
            <g data-wave-parallax>
              <g data-wave-pointer>
                <g data-wave-drift>
                  {[0, 3040].map(offset => (
                    <g key={offset} transform={`translate(${offset} 0)`}>
                      <use href={`#${idPrefix}-wave-shape-${wave.key}`} className="landing-wave-haze" stroke={`url(#${idPrefix}-wave-gradient-${wave.key})`} />
                      <use href={`#${idPrefix}-wave-shape-${wave.key}`} className="landing-wave-body" stroke={`url(#${idPrefix}-wave-gradient-${wave.key})`} />
                      <use href={`#${idPrefix}-wave-shape-${wave.key}`} className="landing-wave-core" stroke={`url(#${idPrefix}-wave-gradient-${wave.key})`} />
                    </g>
                  ))}
                </g>
              </g>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
