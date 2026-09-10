import { motion, useReducedMotion } from 'framer-motion';

export function PageTransition({ children, className = '' }) {
  const reducedMotion = useReducedMotion();
  return <motion.div initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className={`page-transition min-w-0 ${className}`}>{children}</motion.div>;
}

export function ContentTransition({ transitionKey, children, className = '' }) {
  const reducedMotion = useReducedMotion();
  return <motion.div key={transitionKey} initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.26, ease: [0.16, 1, 0.3, 1] }} className={`content-transition min-w-0 ${className}`}>{children}</motion.div>;
}
