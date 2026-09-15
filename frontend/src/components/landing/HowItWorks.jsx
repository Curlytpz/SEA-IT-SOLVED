import { useRef } from 'react';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import MathExpression from '../recognition/MathExpression';
import GlowCard from './GlowCard';
import GlowCardGrid from './GlowCardGrid';
import { useLandingGsap } from './animation/useLandingAnimations';
import { landingStyles } from './landingStyles';

const STAGES = [
  {
    number: '01',
    title: 'Lecture',
    headline: 'Teach naturally. The lesson stays in motion.',
    description: 'SEA-IT-SOLVED follows the active mathematics lesson without interrupting the instructor or replacing classroom judgment.',
  },
  {
    number: '02',
    title: 'Camera Capture',
    headline: 'Preserve the whiteboard when it matters.',
    description: 'Capture corrected board work and lesson-linked classroom evidence while teaching continues naturally.',
  },
  {
    number: '03',
    title: 'Math Recognition',
    headline: 'Turn classroom marks into reviewable mathematics.',
    description: 'Recognize text and equations while preserving the source so the instructor can verify every important expression.',
  },
  {
    number: '04',
    title: 'Contextual AI',
    headline: 'Understand the lesson before creating from it.',
    description: 'Connect the whiteboard, transcript, and approved sources into one instructor-controlled lesson context.',
  },
  {
    number: '05',
    title: 'Structured Notes',
    headline: 'Turn approved context into material students can revisit.',
    description: 'Create readable lesson notes with clear concepts, equations, and worked examples grounded in the reviewed class.',
  },
  {
    number: '06',
    title: 'Quiz',
    headline: 'Continue the lesson with focused practice.',
    description: 'Prepare an editable lesson-grounded quiz, then publish it only when the instructor is ready.',
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

function LectureVisual() {
  return (
    <WindowFrame label="Lecture in progress">
      <div className="grid min-h-[360px] bg-background md:grid-cols-[minmax(0,1fr)_190px]">
        <div className="relative grid min-w-0 place-items-center overflow-hidden">
          <img src={landingWhiteboard} alt="Active calculus lecture on the classroom whiteboard" width="720" height="360" loading="lazy" decoding="async" className="h-full w-full object-contain" />
          <span className="absolute left-3 top-3 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[10px] font-semibold text-foreground">Lesson active · 42:18</span>
        </div>
        <aside className="hidden border-l border-border p-4 md:block">
          <p className="text-[10px] text-muted-foreground">LIVE LESSON</p>
          {['Calculus · CPE-401', 'Board in view', 'Audio linked'].map(item => <p key={item} className="border-b border-border py-4 text-xs">{item}</p>)}
          <p className="mt-4 text-[11px] leading-5 text-muted-foreground">Teaching remains the primary experience.</p>
        </aside>
      </div>
    </WindowFrame>
  );
}

function CaptureVisual() {
  return (
    <WindowFrame label="Active Lesson">
      <div className="grid min-h-[360px] bg-background md:grid-cols-[minmax(0,1fr)_190px]">
        <div className="relative grid place-items-center overflow-hidden">
          <img src={landingWhiteboard} alt="Calculus whiteboard ready for capture" width="720" height="360" loading="lazy" decoding="async" className="h-full w-full object-contain" />
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

function ContextualAiVisual() {
  return (
    <WindowFrame label="Approved Lesson Context" light>
      <div className="grid min-h-[360px] gap-px bg-border md:grid-cols-[0.8fr_1.2fr]">
        <aside className="bg-surface-subtle p-5 sm:p-7">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">CONTEXT SOURCES</p>
          {['Corrected whiteboard', 'Lecture transcript', 'Instructor source'].map((source, index) => (
            <div key={source} className="mt-3 flex min-h-12 items-center justify-between rounded-lg border border-border bg-card px-3 text-xs text-foreground">
              <span>{source}</span>
              <span className="text-[10px] font-semibold text-primary-subtle-foreground">{index < 2 ? 'Included' : 'Review'}</span>
            </div>
          ))}
        </aside>
        <article className="bg-card p-5 sm:p-7">
          <p className="text-[10px] font-semibold text-primary-subtle-foreground">CONTEXTUAL LESSON SUMMARY</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">Power rule for integration</h3>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">The lecture connects antiderivatives to the derivative power rule, then applies the idea to a corrected classroom example.</p>
          <div className="landing-math-fit my-5 rounded-xl bg-surface-subtle p-5 text-center text-xl text-foreground">
            <MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} />
          </div>
          <p className="border-l-2 border-primary pl-4 text-xs leading-6 text-muted-foreground">Instructor approval remains required before material generation.</p>
        </article>
      </div>
    </WindowFrame>
  );
}

const VISUALS = [LectureVisual, CaptureVisual, ReviewVisual, ContextualAiVisual, GenerateVisual, LearnVisual];
const STAGE_GLOWS = [
  'radial-gradient(circle at 78% 42%, hsl(var(--primary) / 0.13), transparent 38%)',
  'radial-gradient(circle at 72% 46%, hsl(var(--primary) / 0.12), transparent 40%)',
  'radial-gradient(circle at 82% 52%, hsl(var(--primary) / 0.11), transparent 39%)',
  'radial-gradient(circle at 76% 58%, hsl(var(--primary) / 0.10), transparent 42%)',
  'radial-gradient(circle at 84% 48%, hsl(var(--primary) / 0.13), transparent 40%)',
  'radial-gradient(circle at 74% 54%, hsl(var(--primary) / 0.12), transparent 41%)',
];

const WORKFLOW_NOTICES = [
  'Lecture active',
  'Camera connected',
  'Equation recognized',
  'Lecture context updated',
  'Notes generated',
  'Quiz ready',
];

function StackedWorkflow() {
  return (
    <div className={`${landingStyles.container} landing-workflow-mobile py-24 sm:py-28 lg:hidden`}>
      <p className={landingStyles.eyebrowDark}>How it works</p>
      <h2 className="mt-5 max-w-[13ch] text-[clamp(2.7rem,10vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.05em]">One lesson. One connected workflow.</h2>
      <div className="mt-16 grid gap-20">
        {STAGES.map((stage, index) => {
          const Visual = VISUALS[index];
          return (
            <article key={stage.number} className="landing-workflow-mobile-step">
              <p className={landingStyles.eyebrowDark}>{stage.number} / {stage.title}</p>
              <h3 className="mt-3 max-w-[16ch] text-3xl font-semibold tracking-[-0.035em]">{stage.headline}</h3>
              <p className="mt-4 max-w-[58ch] text-base leading-7 text-muted-foreground">{stage.description}</p>
              <div className="landing-workflow-panel landing-workflow-mobile-panel relative mt-8">
                <span className="landing-workflow-notice">{WORKFLOW_NOTICES[index]}</span>
                <div className="landing-workflow-mobile-visual"><Visual /></div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const sectionRef = useRef(null);
  const pinRef = useRef(null);
  const progressRef = useRef(null);

  useLandingGsap(sectionRef, ({ gsap, desktop, mobile, reduce }) => {
    const section = sectionRef.current;
    if (!section) return undefined;

    if (desktop) {
      const copies = gsap.utils.toArray('.landing-workflow-copy', section);
      const visuals = gsap.utils.toArray('.landing-workflow-visual', section);
      const glows = gsap.utils.toArray('.landing-workflow-glow', section);
      const notices = gsap.utils.toArray('.landing-workflow-desktop .landing-workflow-notice', section);

      gsap.set([...copies, ...visuals, ...glows, ...notices], { autoAlpha: 0 });
      gsap.set([copies[0], visuals[0], glows[0]], { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(progressRef.current, { scaleX: 0 });

      const timeline = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=500%',
          pin: pinRef.current,
          scrub: 0.75,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      timeline
        .to(progressRef.current, { scaleX: 1 / STAGES.length, duration: 0.7 }, 0)
        .fromTo(notices[0], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 }, 0.12)
        .to(notices[0], { autoAlpha: 0, duration: 0.18 }, 0.62);

      STAGES.slice(1).forEach((_, index) => {
        const stageIndex = index + 1;
        const position = stageIndex;
        timeline
          .to([copies[stageIndex - 1], visuals[stageIndex - 1], glows[stageIndex - 1]], {
            autoAlpha: 0,
            y: -18,
            scale: 0.985,
            duration: 0.22,
          }, position - 0.18)
          .fromTo([copies[stageIndex], visuals[stageIndex], glows[stageIndex]], {
            autoAlpha: 0,
            y: 22,
            scale: 0.985,
          }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.3,
          }, position)
          .to(progressRef.current, { scaleX: (stageIndex + 1) / STAGES.length, duration: 0.55 }, position)
          .fromTo(notices[stageIndex], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 }, position + 0.08)
          .to(notices[stageIndex], { autoAlpha: 0, duration: 0.18 }, position + 0.62);
      });

      timeline.to({}, { duration: 0.65 });
    }

    if (mobile) {
      gsap.utils.toArray('.landing-workflow-mobile-step', section).forEach(step => {
        const visual = step.querySelector('.landing-workflow-mobile-visual');
        const notice = step.querySelector('.landing-workflow-notice');
        gsap.timeline({
          scrollTrigger: {
            trigger: step,
            start: 'top 88%',
            end: 'bottom 35%',
            scrub: 0.55,
          },
        })
          .fromTo(step, { autoAlpha: 0.35, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4 })
          .fromTo(visual, { clipPath: 'inset(9% 4% 9% 4% round 18px)', scale: 0.975 }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', scale: 1, duration: 0.6 }, 0)
          .fromTo(notice, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 }, 0.22)
          .to(notice, { autoAlpha: 0, duration: 0.18 }, 0.72);
      });
    }

    if (reduce) {
      gsap.set('.landing-workflow-mobile-step, .landing-workflow-mobile-visual', { clearProps: 'all' });
    }

    return undefined;
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} className="landing-workflow landing-section-light relative overflow-clip bg-background text-foreground">
      <StackedWorkflow />

      <div ref={pinRef} className="landing-workflow-desktop relative hidden min-h-dvh items-center overflow-clip lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {STAGE_GLOWS.map((background) => (
            <div key={background} style={{ background }} className="landing-workflow-glow absolute inset-0" />
          ))}
        </div>

        <div className={`${landingStyles.container} relative grid grid-cols-[0.7fr_1.3fr] items-center gap-14 xl:gap-20`}>
          <div className="min-w-0">
            <p className={landingStyles.eyebrowDark}>How it works</p>
            <h2 className="mt-5 max-w-[10ch] text-[clamp(3.4rem,5vw,5.7rem)] font-semibold leading-[0.92] tracking-[-0.055em]">One lesson. One connected workflow.</h2>
            <div className="relative mt-10 min-h-[230px] xl:min-h-[250px]">
              {STAGES.map(stage => (
                <div key={stage.number} className="landing-workflow-copy pointer-events-none absolute inset-x-0 top-0">
                  <p className={landingStyles.eyebrowDark}>{stage.number} / {stage.title}</p>
                  <h3 className="mt-3 max-w-[16ch] text-2xl font-semibold tracking-[-0.03em]">{stage.headline}</h3>
                  <p className="mt-4 max-w-[48ch] text-sm leading-6 text-muted-foreground">{stage.description}</p>
                </div>
              ))}
            </div>
          </div>

          <GlowCardGrid className="relative min-h-[460px] xl:min-h-[520px]" aria-hidden="true">
            {VISUALS.map((Visual, index) => (
              <div key={STAGES[index].number} className="landing-workflow-visual pointer-events-none absolute inset-0 grid place-items-center">
                <div className="landing-workflow-panel w-full">
                  <span className="landing-workflow-notice whitespace-nowrap">{WORKFLOW_NOTICES[index]}</span>
                  <Visual />
                </div>
              </div>
            ))}
          </GlowCardGrid>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-border">
          <div ref={progressRef} className="h-px origin-left bg-primary" />
        </div>
      </div>
    </section>
  );
}
