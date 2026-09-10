import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, FileAudio, FileText, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import MathExpression from '../recognition/MathExpression';
import GlowCard from './GlowCard';
import { landingMotion, landingStyles } from './landingStyles';

const SOURCES = [
  { label: 'Whiteboard 01', meta: 'Included', Icon: Image, active: true },
  { label: 'Transcript', meta: 'Included', Icon: FileAudio },
  { label: 'Lesson source', meta: 'Review', Icon: FileText },
];

function SourceNavigation() {
  return (
    <nav aria-label="Illustrative lesson sources" className="landing-scroll-strip flex gap-2 overflow-x-auto border-b border-border bg-surface-subtle p-3 md:flex-col md:border-b-0 md:border-r md:p-4">
      {SOURCES.map(({ label, meta, Icon, active }) => (
        <span key={label} className={`flex min-h-12 min-w-[150px] items-center gap-3 rounded-xl px-3 text-left md:min-w-0 ${active ? 'bg-surface-elevated text-foreground shadow-sm' : 'text-muted-foreground'}`}>
          <Icon size={16} className={active ? 'text-primary-subtle-foreground' : 'text-muted-foreground'} />
          <span className="min-w-0">
            <strong className="block truncate text-[11px]">{label}</strong>
            <small className="mt-0.5 block text-[10px] font-medium text-muted-foreground">{meta}</small>
          </span>
        </span>
      ))}
    </nav>
  );
}

function ReviewWorkspace() {
  return (
    <GlowCard tone="light" tilt className={`landing-section-light ${landingStyles.lightSurface}`}>
      <header className="flex min-h-14 items-center justify-between border-b border-border px-4 sm:px-5">
        <div>
          <span className="block text-[10px] font-semibold text-muted-foreground">LESSON CONTEXT REVIEW</span>
          <strong className="mt-1 block text-xs text-foreground">Calculus - CPE-401</strong>
        </div>
        <span className="text-[11px] font-semibold text-primary-subtle-foreground">3 of 4 included</span>
      </header>

      <div className="grid md:grid-cols-[170px_minmax(0,1fr)]">
        <SourceNavigation />
        <div className="grid items-stretch lg:grid-cols-[1.05fr_0.95fr]">
          <div className="landing-section-dark flex min-w-0 border-b border-border bg-sidebar p-3 lg:min-h-[420px] lg:border-b-0 lg:border-r sm:p-4">
            <div className="relative grid min-h-[300px] w-full flex-1 place-items-center overflow-hidden rounded-xl bg-background lg:min-h-0">
              <img src={landingWhiteboard} alt="Captured classroom calculus whiteboard" className="object-contain w-full h-full" />
              <span className="absolute left-3 top-3 rounded-md bg-background/90 px-2.5 py-1.5 text-[10px] font-semibold text-foreground">Corrected capture</span>
            </div>
          </div>

          <article className="flex min-h-[360px] min-w-0 flex-col p-5 sm:p-7 lg:min-h-[420px]">
            <p className="text-[10px] font-semibold text-muted-foreground">RECOGNIZED CONTEXT</p>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">Power rule for integration</h3>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Increase the exponent by one, divide by the new exponent, and include the constant of integration.
            </p>
            <div className="landing-math-fit my-5 flex min-h-28 items-center justify-center overflow-hidden border-y border-border px-2 py-4 text-center text-foreground">
              <MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} />
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary-subtle-foreground" />
              <p className="text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Instructor included.</strong> This source can move into lesson generation.</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-auto pt-7">
              <span className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-xs font-semibold text-secondary-foreground">Edit content</span>
              <span className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">Approve context</span>
            </div>
          </article>
        </div>
      </div>
    </GlowCard>
  );
}

export default function InstructorWorkspace() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="instructors" className={`landing-section-light relative overflow-clip bg-background text-foreground ${landingStyles.section}`}>
      <div aria-hidden="true" className="absolute -right-44 top-36 h-[420px] w-[420px] rounded-full" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.08), transparent 68%)' }} />
      <div className={landingStyles.container}>
        <motion.div
          initial={reducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={landingMotion.viewport}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
          className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center"
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: landingMotion.reveal } }}>
            <p className={landingStyles.eyebrowDark}>Instructor experience</p>
            <h2 className={`mt-5 max-w-[10ch] ${landingStyles.heading}`}>Human judgment stays in the loop.</h2>
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: landingMotion.reveal } }} className="lg:justify-self-end">
            <p className={`max-w-[620px] ${landingStyles.bodyDark}`}>Captured evidence becomes useful only after academic review. Instructors can inspect recognition, correct mathematics, choose sources, and decide what students receive.</p>
            <Link to="/register/instructor" className={`mt-7 ${landingStyles.lightSecondaryButton}`}>
              Explore the instructor workflow <ArrowRight size={17} />
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
          className="mt-10 lg:mt-12"
        >
          <ReviewWorkspace />
        </motion.div>
      </div>
    </section>
  );
}
