export const MOTION_EASE = [0.32, 0.72, 0, 1];
export const TACTILE_SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 };

export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: MOTION_EASE },
  },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

export const createStaggerContainer = (delayChildren = 0, staggerChildren = 0.04) => ({
  hidden: {},
  visible: { transition: { delayChildren, staggerChildren } },
});

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.25, ease: MOTION_EASE },
  },
};

export const slideFromLeft = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: MOTION_EASE },
  },
};

export const slideFromRight = {
  hidden: { opacity: 0, x: 8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: MOTION_EASE },
  },
};

export const scaleUp = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.25, ease: MOTION_EASE },
  },
};

export const viewportOnce = { once: true, margin: '-80px' };
