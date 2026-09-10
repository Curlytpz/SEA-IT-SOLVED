import { motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  GraduationCap,
  Sigma,
  Sparkles,
} from 'lucide-react';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import MathExpression from '../recognition/MathExpression';
import GlowCard from './GlowCard';
import GlowCardGrid from './GlowCardGrid';
import { landingMotion, landingStyles } from './landingStyles';

const SUPPORTING_FEATURES = [
  {
    icon: Sparkles,
    label: 'AI-Assisted Materials',
    description: 'Create structured lesson notes from the context an instructor has approved.',
  },
  {
    icon: Sigma,
    label: 'Math-Aware Content',
    description: 'Render and edit mathematical expressions in readable academic form.',
  },
  {
    icon: BookOpenCheck,
    label: 'Quiz Generation',
    description: 'Prepare instructor-reviewed quiz drafts grounded in lesson topics.',
  },
  {
    icon: BarChart3,
    label: 'Performance Analytics',
    description: 'Review submissions, question outcomes, and topic-level performance.',
  },
];

const SECONDARY_FEATURES = [
  {
    icon: GraduationCap,
    label: 'Student Learning Portal',
    description: 'Give enrolled students one place for lessons, quizzes, and results.',
  },
  {
    icon: Download,
    label: 'PDF & DOCX Downloads',
    description: 'Export approved lesson materials for offline study and classroom use.',
  },
];

const cardVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

function CapabilityIcon({ icon: Icon }) {
  return (
    <span className="capability-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-primary">
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}

export default function FeatureGrid() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="features" className={`landing-section-dark landing-noise relative overflow-clip bg-background text-foreground ${landingStyles.section}`}>
      <div aria-hidden="true" className="pointer-events-none absolute right-[-16rem] top-12 h-[620px] w-[620px] rounded-full" style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.11), transparent 68%)' }} />

      <div className={`${landingStyles.container} relative grid items-start gap-14 lg:grid-cols-[0.36fr_0.64fr] lg:gap-16 xl:gap-24`}>
        <motion.header
          initial={reducedMotion ? false : { opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
        >
          <p className={landingStyles.eyebrowLight}>Everything you need</p>
          <h2 className={`${landingStyles.heading} mt-5 max-w-[11ch]`}>Built around the real mathematics lesson workflow.</h2>
          <p className={`${landingStyles.bodyLight} mt-7 max-w-[31rem]`}>
            One connected system preserves classroom evidence, keeps academic review visible, and carries approved learning into every student experience.
          </p>
        </motion.header>

        <GlowCardGrid className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="contents">
            <motion.div
              variants={cardVariant}
              initial={reducedMotion ? false : 'hidden'}
              whileInView="visible"
              viewport={landingMotion.viewport}
              className="sm:col-span-2"
            >
              <GlowCard trackPointer={false} className="min-h-[390px] rounded-[22px] border-border bg-sidebar">
                <header className="flex flex-wrap items-center gap-3 px-5 border-b min-h-16 border-border sm:px-7">
                  <CapabilityIcon icon={Camera} />
                  <div>
                    <p className="text-[11px] font-semibold text-primary">PRIMARY CLASSROOM WORKFLOW</p>
                    <h3 className="mt-1 text-base font-semibold text-foreground">Smart Lesson Capture + Instructor Review</h3>
                  </div>
                  <span className="ml-auto hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
                    Human approval required
                  </span>
                </header>

                <div className="grid min-h-[320px] lg:grid-cols-[1.12fr_0.88fr]">
                  <div className="relative grid min-h-[230px] place-items-center overflow-hidden border-b border-border bg-background p-3 lg:border-b-0 lg:border-r sm:p-5">
                    <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(circle at 54% 30%, hsl(var(--primary) / 0.09), transparent 58%)' }} />
                    <img src={landingWhiteboard} alt="Captured calculus whiteboard awaiting instructor review" className="relative z-10 max-h-[310px] w-full object-contain" />
                    <span className="absolute left-4 top-4 z-20 rounded-lg border border-white/10 bg-background/90 px-3 py-2 text-[10px] font-semibold text-foreground">Corrected whiteboard capture</span>
                  </div>

                  <article className="flex flex-col min-w-0 p-5 sm:p-7">
                    <div className="flex items-center gap-2 text-[10px] font-semibold text-primary">
                      <ClipboardCheck size={14} aria-hidden="true" /> APPROVED LESSON CONTEXT
                    </div>
                    <h4 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">Power rule for integration</h4>
                    <p className="mt-4 text-sm leading-7 text-secondary-foreground">Preserve corrected whiteboard images and lesson-linked source context, then let the instructor decide what moves forward.</p>
                    <div className="flex items-center justify-center px-3 py-4 my-6 overflow-hidden text-center landing-section-light landing-math-fit min-h-20 rounded-xl bg-card text-foreground">
                      <MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} />
                    </div>
                    <p className="flex items-start gap-2 mt-auto text-xs leading-5 text-secondary-foreground">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                      Recognition remains reviewable before generation.
                    </p>
                  </article>
                </div>
              </GlowCard>
            </motion.div>

            {SUPPORTING_FEATURES.map(({ icon, label, description }) => (
              <motion.div
                key={label}
                variants={cardVariant}
                initial={reducedMotion ? false : 'hidden'}
                whileInView="visible"
                viewport={landingMotion.viewport}
              >
                <GlowCard trackPointer={false} className="h-full min-h-[190px] p-6 sm:p-7">
                  <CapabilityIcon icon={icon} />
                  <h3 className="mt-6 text-sm font-semibold text-foreground">{label}</h3>
                  <p className="mt-2.5 text-[13px] leading-6 text-muted-foreground">{description}</p>
                </GlowCard>
              </motion.div>
            ))}

            <motion.div
              variants={cardVariant}
              initial={reducedMotion ? false : 'hidden'}
              whileInView="visible"
              viewport={landingMotion.viewport}
              className="sm:col-span-2"
            >
              <GlowCard trackPointer={false} className="rounded-[22px]">
                <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  {SECONDARY_FEATURES.map(({ icon, label, description }) => (
                    <article key={label} className="flex min-w-0 gap-4 p-6 sm:p-7">
                      <CapabilityIcon icon={icon} />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          </div>
        </GlowCardGrid>
      </div>
    </section>
  );
}
