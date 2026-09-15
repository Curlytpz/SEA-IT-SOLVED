import { useRef } from 'react';
import {
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from 'framer-motion';

export default function InteractiveWordmark({
  children,
  className = '',
  giant = false,
  ...props
}) {
  const ref = useRef(null);
  const reducedMotion = useReducedMotion();

  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);

  const smoothX = useSpring(pointerX, {
    stiffness: 155,
    damping: 27,
    mass: 0.72,
  });

  const smoothY = useSpring(pointerY, {
    stiffness: 155,
    damping: 27,
    mass: 0.72,
  });

  useMotionValueEvent(smoothX, 'change', value => {
    ref.current?.style.setProperty(
      '--wordmark-light-x',
      `${value}%`
    );
  });

  useMotionValueEvent(smoothY, 'change', value => {
    ref.current?.style.setProperty(
      '--wordmark-light-y',
      `${value}%`
    );
  });

  const handlePointerMove = event => {
    if (
      reducedMotion ||
      !window.matchMedia(
        '(hover: hover) and (pointer: fine)'
      ).matches
    ) {
      return;
    }

    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    const x =
      ((event.clientX - rect.left) / rect.width) * 100;

    const y =
      ((event.clientY - rect.top) / rect.height) * 100;

    pointerX.set(x);
    pointerY.set(y);
  };

  return (
    <span
      ref={ref}
      onPointerEnter={handlePointerMove}
      onPointerMove={handlePointerMove}
      className={`landing-interactive-wordmark ${
        giant ? 'is-giant' : ''
      } ${className}`}
      {...props}
    >
      <span className="landing-interactive-wordmark-content">
        {children}
      </span>

      {giant ? (
        <span
          className="landing-interactive-wordmark-reveal"
          aria-hidden="true"
        >
          {children}
        </span>
      ) : (
        <span
          className="landing-interactive-wordmark-light"
          aria-hidden="true"
        />
      )}
    </span>
  );
}