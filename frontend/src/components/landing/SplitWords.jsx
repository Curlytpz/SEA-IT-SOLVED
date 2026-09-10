import { motion, useReducedMotion } from 'framer-motion';

export default function SplitWords({ text, className = '', delayStart = 0.15, trigger = 'mount' }) {
  const reducedMotion = useReducedMotion();
  const words = text.split(' ');
  const revealOnScroll = trigger === 'view';

  if (reducedMotion) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="-mb-[0.16em] inline-block overflow-hidden pb-[0.16em] align-top">
          <motion.span
            className="inline-block"
            initial={{ y: revealOnScroll ? '110%' : '115%', rotateZ: revealOnScroll ? 0 : 6 }}
            animate={!revealOnScroll ? { y: '0%', rotateZ: 0 } : undefined}
            whileInView={revealOnScroll ? { y: '0%', rotateZ: 0 } : undefined}
            viewport={revealOnScroll ? { once: true, margin: '0px 0px -60px 0px' } : undefined}
            transition={{ duration: revealOnScroll ? 0.75 : 0.85, delay: delayStart + i * (revealOnScroll ? 0.05 : 0.06), ease: [0.16, 1, 0.3, 1] }}
          >
            {word}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}
