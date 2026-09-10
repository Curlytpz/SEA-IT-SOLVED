import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpenCheck, Download, FileText, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import MathExpression from '../recognition/MathExpression';
import GlowCard from './GlowCard';
import { landingMotion, landingStyles } from './landingStyles';

function StudentLessonPreview({ reducedMotion }) {
  return (
    <GlowCard
      tone="light"
      tilt
      className="landing-section-light overflow-hidden rounded-[22px] border border-border bg-surface-subtle shadow-[0_38px_100px_-58px_rgba(15,23,42,0.24)]"
      role="img"
      aria-label="Student workspace showing an approved mathematics lesson, lesson quiz, and downloadable notes"
    >
      <header className="flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
          <BookOpenCheck size={17} />
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-xs text-foreground">Calculus Fundamentals</strong>
          <span className="mt-1 block text-[10px] text-muted-foreground">CPE-401 · Lesson 04</span>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-primary-subtle px-2.5 py-1 text-[10px] font-semibold text-primary-subtle-foreground">Approved</span>
      </header>

      <div className="grid gap-3 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-8">
          <p className="text-[10px] font-semibold text-primary-subtle-foreground">CORE CONCEPT</p>
          <h3 className="mt-3 max-w-[14ch] font-serif text-3xl leading-tight text-foreground sm:text-4xl">Power Rule for Integration</h3>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
            Increase the exponent by one, then divide by the new exponent.
          </p>
          <div className="landing-math-fit my-7 flex min-h-24 items-center justify-center overflow-hidden border-y border-border px-2 py-5 text-center text-foreground">
            <MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} />
          </div>
          <div className="rounded-xl bg-surface-subtle p-4 sm:flex sm:items-center sm:gap-6">
            <span className="text-[10px] font-semibold text-muted-foreground">EXAMPLE</span>
            <span className="landing-math-fit mt-2 block min-w-0 flex-1 overflow-hidden text-foreground sm:mt-0"><MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} /></span>
          </div>
        </article>

        <motion.aside
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : { ...landingMotion.reveal, delay: 0.16 }}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"
        >
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold text-primary-subtle-foreground">LESSON QUIZ</span>
              <span className="text-[10px] text-muted-foreground">2 of 5</span>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-foreground">Which expression is the antiderivative of x²?</p>
            <div className="mt-4 grid gap-2">
              {['x³ + C', 'x³ / 3 + C', '2x + C'].map((answer, index) => (
                <span key={answer} className={`flex min-h-10 items-center rounded-lg border px-3 font-serif text-xs ${index === 1 ? 'border-primary bg-primary-subtle text-foreground' : 'border-border text-muted-foreground'}`}>
                  {answer}
                </span>
              ))}
            </div>
          </div>

          <div className="landing-section-dark rounded-xl border border-border bg-sidebar p-4 text-foreground">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Download size={15} className="text-primary" /> Keep studying offline
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {['PDF', 'DOCX'].map(format => (
                <span key={format} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-subtle text-[10px] font-semibold text-secondary-foreground">
                  <FileText size={13} /> {format}
                </span>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-[10px] leading-5 text-muted-foreground">
              <LockKeyhole size={12} /> Available only to enrolled students
            </p>
          </div>
        </motion.aside>
      </div>
    </GlowCard>
  );
}

export default function StudentExperience() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="students" className={`landing-section-light ${landingStyles.section} overflow-clip border-y border-border bg-background text-foreground`}>
      <div className={`${landingStyles.container} grid items-center gap-12 lg:grid-cols-[0.35fr_0.65fr] lg:gap-16 xl:gap-24`}>
        <motion.header
          initial={reducedMotion ? false : { opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
        >
          <p className={landingStyles.eyebrowDark}>Learn</p>
          <h2 className={`${landingStyles.heading} mt-5 max-w-[11ch]`}>Approved mathematics, ready when students need it.</h2>
          <p className={`${landingStyles.bodyDark} mt-7 max-w-[29rem]`}>
            Clear lessons, focused quizzes, and downloadable notes—grounded in what the instructor approved.
          </p>
          <div className="mt-9">
            <Link to="/register/student" className={landingStyles.primaryButton}>
              Create Student Account <ArrowRight size={17} />
            </Link>
          </div>
        </motion.header>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
          className="min-w-0"
        >
          <StudentLessonPreview reducedMotion={reducedMotion} />
        </motion.div>
      </div>
    </section>
  );
}
