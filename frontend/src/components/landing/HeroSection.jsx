import { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import AmbientMathScene from './AmbientMathScene';
import GlowCard from './GlowCard';
import MagneticButton from './MagneticButton';
import SplitWords from './SplitWords';
import { landingMotion, landingStyles } from './landingStyles';

const STATUS_ITEMS = [
  ['Camera', 'Ready'],
  ['Microphone', 'Recording'],
  ['Lighting', 'Auto'],
];

function ProductWindow() {
  return (
    <GlowCard
      tilt
      role="img"
      aria-label="Active SEA-IT-SOLVED lesson workspace with a corrected classroom whiteboard"
      className={`${landingStyles.darkSurface} relative rounded-[22px] bg-card shadow-[0_56px_140px_-54px_rgba(0,0,0,0.72)]`}
    >
      <header className="flex min-h-14 items-center gap-2 border-b border-border px-4 text-[11px] text-muted-foreground sm:px-5">
        <strong className="ml-2 truncate text-foreground">Active Lesson Workspace</strong>
        <span className="ml-auto hidden items-center gap-1.5 text-primary sm:inline-flex">
          Lesson active · 42:18
        </span>
      </header>

      <div className="grid min-h-[300px] bg-background sm:min-h-[440px] lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative grid min-w-0 overflow-hidden place-items-center bg-background">
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(circle at 60% 30%, hsl(var(--primary) / 0.09), transparent 56%)' }} />
          <img src={landingWhiteboard} alt="Classroom whiteboard filled with handwritten calculus examples" className="relative z-10 h-full max-h-[440px] w-full object-contain" />
          <span className="absolute left-3 top-3 z-20 rounded-full border border-white/10 bg-background/90 px-3 py-1.5 text-[10px] font-semibold text-foreground shadow-lg sm:left-4 sm:top-4">Corrected whiteboard view</span>
          <span className="absolute bottom-3 right-3 z-20 hidden items-center gap-1.5 rounded-full border border-primary/25 bg-sidebar/90 px-3 py-1.5 text-[10px] font-semibold text-primary sm:inline-flex">
            <Check size={11} aria-hidden="true" /> Calibration applied
          </span>
        </div>

        <aside className="hidden p-5 border-l border-border bg-card lg:block">
          <p className="text-[10px] font-semibold tracking-[0.13em] text-muted-foreground">CLASSROOM STATUS</p>
          {STATUS_ITEMS.map(([label, status], index) => (
            <div key={label} className="py-4 border-b border-border">
              <span className="block text-[11px] text-muted-foreground">{label}</span>
              <strong className="mt-1.5 flex items-center gap-2 text-xs text-foreground">
                <i className="h-1.5 w-1.5 rounded-full bg-primary" />
                {status}
              </strong>
            </div>
          ))}
          <div className="mt-5 rounded-full bg-primary px-3 py-3 text-center text-[11px] font-bold text-primary-foreground shadow-[0_14px_38px_-20px_hsl(var(--primary)/0.95)]">Capture Whiteboard</div>
        </aside>
      </div>

      <footer className="flex min-h-12 items-center justify-between gap-4 border-t border-border px-4 text-[10px] text-muted-foreground sm:px-5">
        <span className="inline-flex items-center gap-2">Latest capture saved </span>
        <span className="hidden sm:inline">Instructor review follows the lesson</span>
      </footer>
    </GlowCard>
  );
}

export default function HeroSection() {
  const reducedMotion = useReducedMotion();
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const copyY = useTransform(scrollYProgress, [0, 0.28, 1], [0, 0, -18]);
  const visualY = useTransform(scrollYProgress, [0, 0.24, 1], [0, 0, -36]);
  const visualScale = useTransform(scrollYProgress, [0, 0.24, 1], [1, 1, 0.99]);
  const atmosphereY = useTransform(scrollYProgress, [0, 0.2, 1], [0, 0, 60]);

  return (
    <section ref={sectionRef} className="relative landing-section-dark isolate bg-sidebar text-foreground">
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <AmbientMathScene compact />
        <motion.div
          style={{
            ...(reducedMotion ? {} : { y: atmosphereY }),
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.19), hsl(var(--ambient-1) / 0.07) 42%, transparent 70%)',
          }}
          className="absolute -right-[16rem] -top-[22rem] h-[54rem] w-[54rem] rounded-full blur-2xl"
        />
        <div className="absolute left-[-15rem] top-[32%] h-[34rem] w-[34rem] rounded-full" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.11), transparent 68%)' }} />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(45,212,191,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(45,212,191,0.22)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      </div>

      <div className={`${landingStyles.container} relative grid min-h-[calc(100svh-72px)] items-center gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-8 lg:py-24 xl:grid-cols-[minmax(440px,0.78fr)_minmax(0,1.22fr)] xl:gap-4`}>
        <motion.div style={reducedMotion ? undefined : { y: copyY }} className="relative z-20 max-w-[680px] lg:pb-20">
          <motion.p initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.52, delay: reducedMotion ? 0 : 0.04, ease: landingMotion.ease }} className="mb-7 flex items-center gap-3 text-xs font-semibold tracking-[0.08em] text-primary sm:text-sm">
            <span className="w-8 h-px bg-primary" aria-hidden="true" />CLASSROOM INTELLIGENCE, INSTRUCTOR LED
          </motion.p>

          <h1 className="text-[clamp(3rem,10vw,4rem)] font-semibold leading-[0.86] tracking-[-0.07em] text-balance sm:text-[clamp(4rem,8vw,9rem)]">
            <span className="block"><SplitWords text="Capture the" delayStart={0.08} /></span>
            <span className="block"><SplitWords text="lesson." delayStart={0.14} /></span>
            <span className="block text-primary"><SplitWords text="Extend the" delayStart={0.2} /></span>
            <span className="block text-primary"><SplitWords text="learning." delayStart={0.26} /></span>
          </h1>

          <motion.p initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.58, delay: reducedMotion ? 0 : 0.34, ease: landingMotion.ease }} className="mt-8 max-w-[590px] text-base leading-7 text-secondary-foreground sm:text-lg sm:leading-8">
            Capture classroom mathematics, review recognized context, and turn instructor-approved lessons into notes, quizzes, and continued learning after class.
          </motion.p>

          <motion.div initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.56, delay: reducedMotion ? 0 : 0.42, ease: landingMotion.ease }} className="flex flex-col gap-3 mt-9 sm:flex-row">
            <MagneticButton strength={14} className="w-full sm:w-auto">
              <Link to="/register/student" className={`${landingStyles.primaryButton} group w-full sm:w-auto`}>Get Started<ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" /></Link>
            </MagneticButton>
            <Link to="/login" className={`${landingStyles.darkSecondaryButton} w-full sm:w-auto`}>Sign In</Link>
          </motion.div>

          <motion.p initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.5 }} className="mt-6 text-xs leading-5 text-muted-foreground sm:text-sm">
            Whiteboard capture · Human review · Math-aware learning
          </motion.p>
        </motion.div>

        <motion.div initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.68, delay: reducedMotion ? 0 : 0.18, ease: landingMotion.ease }} className="relative z-10 w-full min-w-0">
          <motion.div style={reducedMotion ? undefined : { y: visualY, scale: visualScale }} className="relative [perspective:1400px]">
            <div aria-hidden="true" className="absolute -inset-5 rounded-[36px] blur-xl" style={{ background: 'radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.13), transparent 70%)' }} />
            <ProductWindow />
          </motion.div>
        </motion.div>
      </div>

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
