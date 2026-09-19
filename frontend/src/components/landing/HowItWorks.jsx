import { useRef, useState } from 'react';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import landingLectureWhiteboard from '../../assets/landing-whiteboard-new.png';
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
        <div className="relative grid min-w-0 overflow-hidden place-items-center">
         <img src={landingLectureWhiteboard}alt="Active calculus lecture on the classroom whiteboard"width="720"height="360"loading="lazy"decoding="async"className="object-cover w-full h-full"/>
          <span className="absolute left-3 top-3 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[10px] font-semibold text-foreground">Lesson active · 42:18</span>
        </div>
        <aside className="hidden p-4 border-l border-border md:block">
          <p className="text-[10px] text-muted-foreground">LIVE LESSON</p>
          {['Calculus · CPE-401', 'Board in view', 'Audio linked'].map(item => <p key={item} className="py-4 text-xs border-b border-border">{item}</p>)}
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
        <div className="relative grid overflow-hidden place-items-center">
          <img src={landingWhiteboard} alt="Calculus whiteboard ready for capture" width="720" height="360" loading="lazy" decoding="async" className="object-contain w-full h-full" />
          <span className="absolute left-3 top-3 rounded bg-background/85 px-2 py-1 text-[10px] font-semibold">Corrected whiteboard</span>
        </div>
        <aside className="hidden p-4 border-l border-border md:block">
          <p className="text-[10px] text-muted-foreground">DEVICE STATUS</p>
          {['Camera ready', 'Audio recording', 'Lighting auto'].map(item => <p key={item} className="py-4 text-xs border-b border-border">{item}</p>)}
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
        <article className="p-5 bg-sidebar sm:p-7">
          <p className="text-[10px] text-muted-foreground">WHITEBOARD PAGE 1</p>
          <div className="grid p-5 mt-5 text-2xl rounded-lg landing-section-light min-h-36 place-items-center bg-card text-foreground">
            <MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} />
          </div>
          <p className="mt-5 text-xs font-semibold text-primary">Included in context</p>
        </article>
        <article className="p-5 bg-surface-subtle sm:p-7">
          <p className="text-[10px] text-muted-foreground">TRANSCRIPT 04:18</p>
          <p className="p-4 mt-5 text-sm leading-7 border rounded-lg border-border text-secondary-foreground">
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
        <p className="max-w-2xl mt-5 text-sm leading-7 text-muted-foreground">
          An antiderivative reverses differentiation and represents a family of functions with the same derivative.
        </p>
        <div className="text-2xl text-center mt-7 border-y border-border py-7">
          <MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} />
        </div>
        <div className="grid gap-3 mt-7 sm:grid-cols-2">
          <p className="pl-4 text-sm leading-6 border-l-2 border-primary text-muted-foreground">Worked examples stay connected to the classroom source.</p>
          <p className="pl-4 text-sm leading-6 border-l-2 border-primary text-muted-foreground">The instructor can edit before publishing.</p>
        </div>
      </article>
    </WindowFrame>
  );
}

function LearnVisual() {
  return (
    <WindowFrame label="Student Learning Workspace" light>
      <div className="grid min-h-[360px] md:grid-cols-[0.74fr_1.26fr]">
        <aside className="hidden p-5 border-r border-border bg-surface-subtle md:block">
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
          <div className="p-5 my-5 text-2xl text-center rounded-lg bg-surface-subtle">
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
        <aside className="p-5 bg-surface-subtle sm:p-7">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">CONTEXT SOURCES</p>
          {['Corrected whiteboard', 'Lecture transcript', 'Instructor source'].map((source, index) => (
            <div key={source} className="flex items-center justify-between px-3 mt-3 text-xs border rounded-lg min-h-12 border-border bg-card text-foreground">
              <span>{source}</span>
              <span className="text-[10px] font-semibold text-primary-subtle-foreground">{index < 2 ? 'Included' : 'Review'}</span>
            </div>
          ))}
        </aside>
        <article className="p-5 bg-card sm:p-7">
          <p className="text-[10px] font-semibold text-primary-subtle-foreground">CONTEXTUAL LESSON SUMMARY</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">Power rule for integration</h3>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">The lecture connects antiderivatives to the derivative power rule, then applies the idea to a corrected classroom example.</p>
          <div className="p-5 my-5 text-xl text-center landing-math-fit rounded-xl bg-surface-subtle text-foreground">
            <MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} />
          </div>
          <p className="pl-4 text-xs leading-6 border-l-2 border-primary text-muted-foreground">Instructor approval remains required before material generation.</p>
        </article>
      </div>
    </WindowFrame>
  );
}

const VISUALS = [LectureVisual, CaptureVisual, ReviewVisual, ContextualAiVisual, GenerateVisual, LearnVisual];
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
      <div className="grid gap-20 mt-16">
        {STAGES.map((stage, index) => {
          const Visual = VISUALS[index];
          return (
            <article key={stage.number} className="landing-workflow-mobile-step">
              <p className={landingStyles.eyebrowDark}>{stage.number} / {stage.title}</p>
              <h3 className="mt-3 max-w-[16ch] text-3xl font-semibold tracking-[-0.035em]">{stage.headline}</h3>
              <p className="mt-4 max-w-[58ch] text-base leading-7 text-muted-foreground">{stage.description}</p>
              <div className="relative mt-8 landing-workflow-panel landing-workflow-mobile-panel">
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
  const timelineRef = useRef(null);
  const [activeStage, setActiveStage] = useState(0);

  const goToStage = index => {
    const timeline = timelineRef.current;
    const trigger = timeline?.scrollTrigger;
    if (!trigger) return;

    const stageTime = index === 0 ? 0.25 : index + 0.35;
    const scrollPosition = trigger.start + (stageTime / timeline.duration()) * (trigger.end - trigger.start);
    window.scrollTo({ top: scrollPosition, behavior: 'smooth' });
  };

  useLandingGsap(sectionRef, ({ gsap, desktop, mobile, reduce }) => {
    const section = sectionRef.current;
    if (!section) return undefined;

    if (desktop) {
      const copies = gsap.utils.toArray('.landing-workflow-copy', section);
      const visuals = gsap.utils.toArray('.landing-workflow-visual', section);
      const notices = gsap.utils.toArray('.landing-workflow-desktop .landing-workflow-notice', section);

      gsap.set([...copies, ...visuals, ...notices], { autoAlpha: 0 });
      gsap.set([copies[0], visuals[0]], { autoAlpha: 1, y: 0, scale: 1 });
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
      timelineRef.current = timeline;
      timeline.eventCallback('onUpdate', () => {
        const stage = Math.min(STAGES.length - 1, Math.floor(timeline.time() + 0.05));
        setActiveStage(current => current === stage ? current : stage);
      });

      timeline
        .to(progressRef.current, { scaleX: 1 / STAGES.length, duration: 0.7 }, 0)
        .fromTo(notices[0], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 }, 0.12)
        .to(notices[0], { autoAlpha: 0, duration: 0.18 }, 0.62);

      STAGES.slice(1).forEach((_, index) => {
        const stageIndex = index + 1;
        const position = stageIndex;
        timeline
          .to([copies[stageIndex - 1], visuals[stageIndex - 1]], {
            autoAlpha: 0,
            y: -18,
            scale: 0.985,
            duration: 0.22,
          }, position - 0.18)
          .fromTo([copies[stageIndex], visuals[stageIndex]], {
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

      return () => {
        timelineRef.current = null;
      };
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
    <section id="how-it-works" ref={sectionRef} className="relative landing-workflow landing-section-dark overflow-clip bg-background text-foreground">
      <StackedWorkflow />

      <div ref={pinRef} className="relative items-center hidden landing-workflow-desktop min-h-dvh overflow-clip lg:flex">
        <div className={`${landingStyles.container} relative grid grid-cols-[0.7fr_1.3fr] items-center gap-14 xl:gap-20`}>
          <div className="min-w-0">
            <p className={landingStyles.eyebrowDark}>How it works</p>
            <h2 className="mt-5 max-w-[10ch] text-[clamp(3.4rem,5vw,5.7rem)] font-semibold leading-[0.92] tracking-[-0.055em]">One lesson. One connected workflow.</h2>
            <div className="relative mt-10 min-h-[230px] xl:min-h-[250px]">
              {STAGES.map(stage => (
                <div key={stage.number} className="absolute inset-x-0 top-0 pointer-events-none landing-workflow-copy">
                  <p className={landingStyles.eyebrowDark}>{stage.number} / {stage.title}</p>
                  <h3 className="mt-3 max-w-[16ch] text-2xl font-semibold tracking-[-0.03em]">{stage.headline}</h3>
                  <p className="mt-4 max-w-[48ch] text-sm leading-6 text-muted-foreground">{stage.description}</p>
                </div>
              ))}
            </div>
          </div>

          <GlowCardGrid className="relative min-h-[460px] xl:min-h-[520px]" aria-hidden="true">
            {VISUALS.map((Visual, index) => (
              <div key={STAGES[index].number} className="absolute inset-0 grid pointer-events-none landing-workflow-visual place-items-center">
                <div className="w-full landing-workflow-panel">
                  <span className="landing-workflow-notice whitespace-nowrap">{WORKFLOW_NOTICES[index]}</span>
                  <Visual />
                </div>
              </div>
            ))}
          </GlowCardGrid>
        </div>
        <nav aria-label="How it works steps" className="absolute inset-x-0 bottom-5">
          <div className={`${landingStyles.container} flex items-center justify-between gap-4`}>
            <span className="text-xs text-muted-foreground">Scroll to explore all six steps</span>
            <div className="flex items-center gap-1.5">
              {STAGES.map((stage, index) => (
                <button
                  key={stage.number}
                  type="button"
                  onClick={() => goToStage(index)}
                  aria-label={`Show step ${stage.number}: ${stage.title}`}
                  aria-current={activeStage === index ? 'step' : undefined}
                  className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeStage === index ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/60 text-muted-foreground hover:border-primary hover:text-foreground'}`}
                >
                  {stage.number}
                </button>
              ))}
            </div>
          </div>
        </nav>
        <div className="absolute inset-x-0 bottom-0 h-px bg-border">
          <div ref={progressRef} className="h-px origin-left bg-primary" />
        </div>
      </div>
    </section>
  );
}
