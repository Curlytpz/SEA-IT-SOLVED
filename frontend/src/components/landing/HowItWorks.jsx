import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import MathExpression from '../recognition/MathExpression';
import GlowCard from './GlowCard';
import GlowCardGrid from './GlowCardGrid';
import { landingMotion, landingStyles } from './landingStyles';

const STAGES = [
  {
    number: '01',
    title: 'Capture',
    headline: 'Capture the mathematics lesson as it happens.',
    description: 'Preserve the corrected whiteboard and lesson-linked classroom evidence while teaching continues naturally.',
  },
  {
    number: '02',
    title: 'Review',
    headline: 'Keep the instructor in control.',
    description: 'Inspect recognized text, equations, transcripts, and sources before anything becomes student material.',
  },
  {
    number: '03',
    title: 'Generate',
    headline: 'Turn approved context into structured materials.',
    description: 'Create readable lesson notes and editable quiz drafts grounded in the context the instructor approved.',
  },
  {
    number: '04',
    title: 'Learn',
    headline: 'Give students a clear path through the lesson.',
    description: 'Publish approved notes and focused quizzes in one accessible learning workspace students can revisit anytime.',
  },
  {
    number: '05',
    title: 'Analyze',
    headline: 'See where the class understands—and where it needs support.',
    description: 'Review performance by question and topic, then use the evidence to guide the next lesson.',
  },
];

function WindowFrame({ label, children, light = false }) {
  return (
    <GlowCard
      tone={light ? 'light' : 'dark'}
      tilt
      className={`rounded-[16px] shadow-[0_32px_90px_-52px_rgba(15,23,42,0.45)] ${light ? 'landing-section-light border-border bg-card text-foreground' : 'landing-section-dark border-border bg-surface-subtle text-foreground'}`}
    >
      <header className="flex min-h-12 items-center justify-between border-b border-border px-4 text-[11px] text-muted-foreground">
        <strong className="text-foreground">SEA-IT-SOLVED</strong>
        <span>{label}</span>
      </header>
      {children}
    </GlowCard>
  );
}

function CaptureVisual() {
  return (
    <WindowFrame label="Active Lesson">
      <div className="grid min-h-[360px] bg-background md:grid-cols-[minmax(0,1fr)_190px]">
        <div className="relative grid place-items-center overflow-hidden">
          <img src={landingWhiteboard} alt="Calculus whiteboard ready for capture" className="h-full w-full object-contain" />
          <span className="absolute left-3 top-3 rounded bg-background/85 px-2 py-1 text-[10px] font-semibold">Corrected whiteboard</span>
        </div>
        <aside className="hidden border-l border-border p-4 md:block">
          <p className="text-[10px] text-muted-foreground">DEVICE STATUS</p>
          {['Camera ready', 'Audio recording', 'Lighting auto'].map(item => <p key={item} className="border-b border-border py-4 text-xs">{item}</p>)}
          <p className="mt-4 rounded-md bg-primary px-3 py-3 text-center text-[11px] font-bold text-primary-foreground">Capture Whiteboard</p>
        </aside>
      </div>
    </WindowFrame>
  );
}

function ReviewVisual() {
  return (
    <WindowFrame label="Lesson Context Review">
      <div className="grid min-h-[360px] gap-px bg-border sm:grid-cols-2">
        <article className="bg-sidebar p-5 sm:p-7">
          <p className="text-[10px] text-muted-foreground">WHITEBOARD PAGE 1</p>
          <div className="landing-section-light mt-5 grid min-h-36 place-items-center rounded-lg bg-card p-5 text-2xl text-foreground">
            <MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} />
          </div>
          <p className="mt-5 text-xs font-semibold text-primary">Included in context</p>
        </article>
        <article className="bg-surface-subtle p-5 sm:p-7">
          <p className="text-[10px] text-muted-foreground">TRANSCRIPT 04:18</p>
          <p className="mt-5 rounded-lg border border-border p-4 text-sm leading-7 text-secondary-foreground">
            Increase the exponent by one, then divide by the new exponent.
          </p>
          <p className="mt-5 text-xs font-semibold text-primary">Ready for instructor review</p>
        </article>
      </div>
    </WindowFrame>
  );
}

function GenerateVisual() {
  return (
    <WindowFrame label="Generated Lesson Material" light>
      <article className="mx-auto min-h-[360px] max-w-3xl p-7 sm:p-10">
        <p className="text-xs font-semibold text-primary-subtle-foreground">Built from approved lesson context</p>
        <h3 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">Indefinite Integration</h3>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
          An antiderivative reverses differentiation and represents a family of functions with the same derivative.
        </p>
        <div className="mt-7 border-y border-border py-7 text-center text-2xl">
          <MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} />
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <p className="border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">Worked examples stay connected to the classroom source.</p>
          <p className="border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">The instructor can edit before publishing.</p>
        </div>
      </article>
    </WindowFrame>
  );
}

function LearnVisual() {
  return (
    <WindowFrame label="Student Learning Workspace" light>
      <div className="grid min-h-[360px] md:grid-cols-[0.74fr_1.26fr]">
        <aside className="hidden border-r border-border bg-surface-subtle p-5 md:block">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">LESSON CONTENT</p>
          {['Power rule review', 'Worked example', 'Practice quiz'].map((item, index) => (
            <p key={item} className={`mt-3 rounded-lg px-3 py-3 text-xs ${index === 2 ? 'bg-primary-subtle font-semibold text-primary-subtle-foreground' : 'text-muted-foreground'}`}>{item}</p>
          ))}
        </aside>
        <article className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Question 2 of 5</p>
            <span className="text-[10px] font-semibold text-primary-subtle-foreground">Lesson Quiz</span>
          </div>
          <h3 className="mt-4 text-lg font-semibold">Find the antiderivative.</h3>
          <div className="my-5 rounded-lg bg-surface-subtle p-5 text-center text-2xl">
            <MathExpression latex={String.raw`\int 3x^2\,dx`} />
          </div>
          {['x cubed + C', '3x cubed + C', 'x squared + C'].map((choice, index) => (
            <p key={choice} className={`mt-2 rounded-lg border px-4 py-3 text-sm ${index === 0 ? 'border-primary bg-primary-subtle' : 'border-border'}`}>{choice}</p>
          ))}
        </article>
      </div>
    </WindowFrame>
  );
}

function AnalyzeVisual() {
  return (
    <WindowFrame label="Class Analytics" light>
      <div className="min-h-[360px] p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ['Class average', '82%'],
            ['Completed', '28 / 32'],
            ['Questions', '5'],
          ].map(([label, value], index) => (
            <div key={label} className={`${index === 2 ? 'col-span-2 sm:col-span-1' : ''} rounded-xl border border-border p-4`}>
              <p className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">{label.toUpperCase()}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_0.8fr]">
          <article>
            <p className="text-xs font-semibold text-secondary-foreground">Topic performance</p>
            {[['Power rule', 88], ['Integration', 76], ['Algebra', 64]].map(([label, value]) => (
              <div key={label} className="mt-4">
                <div className="flex justify-between text-xs"><span>{label}</span><strong>{value}%</strong></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </article>
          <article className="landing-section-dark rounded-xl bg-card p-5 text-foreground">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">TEACHING SIGNAL</p>
            <p className="mt-4 text-sm font-semibold leading-6">Revisit algebraic simplification before the next integration exercise.</p>
            <p className="mt-5 text-xs text-primary">Based on 32 student attempts</p>
          </article>
        </div>
      </div>
    </WindowFrame>
  );
}

const VISUALS = [CaptureVisual, ReviewVisual, GenerateVisual, LearnVisual, AnalyzeVisual];
const STAGE_GLOWS = [
  'radial-gradient(circle at 78% 42%, hsl(var(--primary) / 0.13), transparent 38%)',
  'radial-gradient(circle at 72% 46%, hsl(var(--primary) / 0.12), transparent 40%)',
  'radial-gradient(circle at 82% 52%, hsl(var(--primary) / 0.11), transparent 39%)',
  'radial-gradient(circle at 76% 58%, hsl(var(--primary) / 0.10), transparent 42%)',
  'radial-gradient(circle at 84% 48%, hsl(var(--primary) / 0.13), transparent 40%)',
];

function StackedWorkflow({ reducedMotion, forceVisible = false }) {
  return (
    <div className={`${landingStyles.container} py-24 sm:py-28 ${forceVisible ? '' : 'lg:hidden'}`}>
      <p className={landingStyles.eyebrowDark}>How it works</p>
      <h2 className="mt-5 max-w-[13ch] text-[clamp(2.7rem,10vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.05em]">One lesson. One connected workflow.</h2>
      <div className="mt-16 grid gap-20">
        {STAGES.map((stage, index) => {
          const Visual = VISUALS[index];
          return (
            <motion.article
              key={stage.number}
              initial={reducedMotion ? false : { opacity: 0, y: 28 }}
              whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={landingMotion.viewport}
              transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
            >
              <p className={landingStyles.eyebrowDark}>{stage.number} / {stage.title}</p>
              <h3 className="mt-3 max-w-[16ch] text-3xl font-semibold tracking-[-0.035em]">{stage.headline}</h3>
              <p className="mt-4 max-w-[58ch] text-base leading-7 text-muted-foreground">{stage.description}</p>
              <div className="mt-8"><Visual /></div>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const reducedMotion = useReducedMotion();
  const trackRef = useRef(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const opacities = [
    useTransform(scrollYProgress, [0, 0.16, 0.21], [1, 1, 0]),
    useTransform(scrollYProgress, [0.17, 0.21, 0.36, 0.41], [0, 1, 1, 0]),
    useTransform(scrollYProgress, [0.37, 0.41, 0.56, 0.61], [0, 1, 1, 0]),
    useTransform(scrollYProgress, [0.57, 0.61, 0.76, 0.81], [0, 1, 1, 0]),
    useTransform(scrollYProgress, [0.77, 0.81, 1], [0, 1, 1]),
  ];
  const stageY = [
    useTransform(scrollYProgress, [0, 0.16, 0.21], [0, 0, -18]),
    useTransform(scrollYProgress, [0.17, 0.21, 0.36, 0.41], [18, 0, 0, -18]),
    useTransform(scrollYProgress, [0.37, 0.41, 0.56, 0.61], [18, 0, 0, -18]),
    useTransform(scrollYProgress, [0.57, 0.61, 0.76, 0.81], [18, 0, 0, -18]),
    useTransform(scrollYProgress, [0.77, 0.81, 1], [18, 0, 0]),
  ];
  const visualScale = [
    useTransform(scrollYProgress, [0, 0.16, 0.21], [1, 1, 0.985]),
    useTransform(scrollYProgress, [0.17, 0.21, 0.36, 0.41], [0.985, 1, 1, 0.985]),
    useTransform(scrollYProgress, [0.37, 0.41, 0.56, 0.61], [0.985, 1, 1, 0.985]),
    useTransform(scrollYProgress, [0.57, 0.61, 0.76, 0.81], [0.985, 1, 1, 0.985]),
    useTransform(scrollYProgress, [0.77, 0.81, 1], [0.985, 1, 1]),
  ];

  useMotionValueEvent(scrollYProgress, 'change', latest => {
    const nextStageIndex =
      latest < 0.19 ? 0
        : latest < 0.39 ? 1
          : latest < 0.59 ? 2
            : latest < 0.79 ? 3
              : 4;

    setActiveStageIndex(current => current === nextStageIndex ? current : nextStageIndex);
  });

  if (reducedMotion) {
    return (
      <section id="how-it-works" className="landing-section-light bg-background text-foreground">
        <StackedWorkflow reducedMotion forceVisible />
      </section>
    );
  }

  return (
    <section id="how-it-works" ref={trackRef} className="landing-section-light relative bg-background text-foreground lg:h-[400vh]">
      <StackedWorkflow reducedMotion={reducedMotion} />

      <div className="sticky top-0 hidden h-screen items-center overflow-clip lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {STAGE_GLOWS.map((background, index) => (
            <motion.div key={background} style={{ opacity: opacities[index], background }} className="absolute inset-0" />
          ))}
        </div>

        <div className={`${landingStyles.container} relative grid grid-cols-[0.7fr_1.3fr] items-center gap-14 xl:gap-20`}>
          <div className="min-w-0">
            <p className={landingStyles.eyebrowDark}>How it works</p>
            <h2 className="mt-5 max-w-[10ch] text-[clamp(3.4rem,5vw,5.7rem)] font-semibold leading-[0.92] tracking-[-0.055em]">One lesson. One connected workflow.</h2>
            <div className="relative mt-10 min-h-[230px] xl:min-h-[250px]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={STAGES[activeStageIndex].number}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.24, ease: landingMotion.ease }}
                  className="pointer-events-none absolute inset-x-0 top-0"
                >
                  <p className={landingStyles.eyebrowDark}>{STAGES[activeStageIndex].number} / {STAGES[activeStageIndex].title}</p>
                  <h3 className="mt-3 max-w-[16ch] text-2xl font-semibold tracking-[-0.03em]">{STAGES[activeStageIndex].headline}</h3>
                  <p className="mt-4 max-w-[48ch] text-sm leading-6 text-muted-foreground">{STAGES[activeStageIndex].description}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <GlowCardGrid className="relative min-h-[460px] xl:min-h-[520px]" aria-hidden="true">
            {VISUALS.map((Visual, index) => (
              <motion.div key={STAGES[index].number} style={{ opacity: opacities[index], y: stageY[index], scale: visualScale[index] }} className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="w-full"><Visual /></div>
              </motion.div>
            ))}
          </GlowCardGrid>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-border">
          <motion.div style={{ scaleX: progress }} className="h-px origin-left bg-primary" />
        </div>
      </div>
    </section>
  );
}
