import { motion, useReducedMotion } from 'framer-motion';
import { viewportOnce } from '../../lib/motionVariants';

const BADGES = ['SEA', 'CPE', 'A25', 'JB', 'RS', 'MK', 'TN', 'LC'];

export default function TrustCluster() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="landing-section-dark relative overflow-hidden bg-sidebar/90 py-24 text-center sm:py-28">
      <div className="mx-auto w-full max-w-[1560px] px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-center h-24 max-w-xl mx-auto">
          {BADGES.map((initials, i) => (
            <motion.span
              key={initials}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.6, filter: 'blur(8px)' }}
              whileInView={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              viewport={viewportOnce}
              transition={{ duration: 0.6, delay: i * 0.07 }}
              style={{ left: `${(i / (BADGES.length - 1)) * 100}%`, top: `${(i % 2) * 26}%` }}
              className="absolute grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-[10px] font-bold text-primary"
            >
              {initials}
            </motion.span>
          ))}
        </div>
        <motion.h2
          initial={reducedMotion ? false : { opacity: 0, y: 18, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={viewportOnce}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="mt-8 text-[clamp(1.8rem,3.6vw,3rem)] font-bold tracking-[-0.03em] text-white text-balance"
        >
          Built with <span className="font-serif italic text-primary">instructors and students</span> in the room
        </motion.h2>
        <motion.p
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="max-w-xl mx-auto mt-4 text-sm leading-6 text-muted-foreground"
        >
          Every review step and quiz format in SEA-IT-SOLVED came out of real classroom capture sessions, not a guess at what a classroom needs.
        </motion.p>
      </div>
    </section>
  );
}
