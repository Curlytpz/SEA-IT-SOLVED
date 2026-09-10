import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import MagneticButton from './MagneticButton';
import { landingMotion, landingStyles } from './landingStyles';

export default function FinalCTA() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="landing-section-dark landing-noise relative overflow-clip bg-background py-24 text-foreground sm:py-28 lg:py-32">
      <motion.div
        aria-hidden="true"
        animate={reducedMotion ? undefined : { opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
        transition={reducedMotion ? { duration: 0 } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-52 right-[-8%] h-[520px] w-[520px] rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.12), transparent 68%)' }}
      />
      <motion.div
        aria-hidden="true"
        animate={reducedMotion ? undefined : { opacity: [0.55, 0.9, 0.55], scale: [1, 1.05, 1] }}
        transition={reducedMotion ? { duration: 0 } : { duration: 5.6, delay: 0.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-60 -top-60 h-[520px] w-[520px] rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.1), transparent 68%)' }}
      />
      <motion.div
        initial={reducedMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={landingMotion.viewport}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
        className={`relative grid gap-12 lg:grid-cols-[1.35fr_0.65fr] lg:items-end ${landingStyles.container}`}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 26 }, visible: { opacity: 1, y: 0, transition: landingMotion.reveal } }}>
          <p className={landingStyles.eyebrowLight}>The classroom continues</p>
          <h2 className={`mt-6 max-w-[14ch] ${landingStyles.display}`}>Turn every mathematics lesson into a connected learning experience.</h2>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 26 }, visible: { opacity: 1, y: 0, transition: landingMotion.reveal } }} className="lg:pb-2">
          <p className={landingStyles.bodyLight}>Capture the classroom, review the context, and continue learning with materials students can trust.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <MagneticButton className="sm:flex-1 lg:flex-none xl:flex-1">
              <Link to="/register/student" className={`w-full ${landingStyles.primaryButton}`}>
                Get Started <ArrowRight size={17} />
              </Link>
            </MagneticButton>
            <Link to="/login" className={`sm:flex-1 lg:flex-none xl:flex-1 ${landingStyles.darkSecondaryButton}`}>Sign In</Link>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
