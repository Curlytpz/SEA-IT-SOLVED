import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bot, MessageSquareText, Sparkles } from 'lucide-react';
import MathExpression from '../recognition/MathExpression';
import GlowCard from './GlowCard';
import { landingMotion, landingStyles } from './landingStyles';

const TABS = [
  ['materials', 'Lesson material'],
  ['assistant', 'AI Lesson Assistant'],
  ['quiz', 'Quiz authoring'],
];

function CaptureReview() {
  return <div className="grid min-h-[430px] lg:grid-cols-2"><div className="landing-section-dark grid content-center gap-5 bg-sidebar p-6 text-center sm:p-10"><span className="text-[10px] font-bold text-muted-foreground">Whiteboard Page 1</span><div className="landing-section-light rounded-xl bg-card px-4 py-14 text-2xl text-foreground sm:text-3xl"><MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} /></div><p className="text-base text-secondary-foreground"><MathExpression latex={String.raw`\lim f(x)\;\cdot\;\frac{dy}{dx}\;\cdot\;\sum`} /></p></div><div className="p-6 sm:p-8"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-foreground">Recognized lesson context</strong><span className="text-[10px] font-bold text-success">Ready for review</span></div><p className="mt-6 text-sm leading-7 text-muted-foreground">The lesson introduces indefinite integration using the power rule.</p><div className="mt-5 rounded-xl bg-surface-subtle p-5 text-center text-xl text-foreground"><MathExpression latex={String.raw`\int x^2\,dx=\frac{x^3}{3}+C`} /></div><div className="mt-6 flex justify-end gap-3 text-xs font-bold"><span className="flex min-h-9 items-center text-primary">Edit</span><span className="flex min-h-9 items-center rounded-lg bg-primary px-3 text-primary-foreground">Include in context</span></div></div></div>;
}

function LessonMaterials() {
  return <div className="grid min-h-[430px] md:grid-cols-[180px_minmax(0,1fr)]"><aside className="landing-scroll-strip flex gap-1 overflow-x-auto border-b border-border bg-surface-subtle p-4 md:flex-col md:border-b-0 md:border-r"><strong className="hidden pb-3 text-xs md:block">Lesson material</strong>{['Overview', 'Core concepts', 'Worked examples', 'Key takeaways'].map((label, index) => <span key={label} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${index === 0 ? 'bg-surface-elevated font-bold text-primary-subtle-foreground' : 'text-muted-foreground'}`}>{label}</span>)}</aside><article className="max-w-3xl p-6 sm:p-10"><span className="text-[10px] font-bold text-primary-subtle-foreground">Generated from approved context</span><h3 className="mt-2 font-serif text-3xl text-foreground">Indefinite Integration</h3><p className="mt-5 text-sm leading-7 text-muted-foreground">An antiderivative reverses differentiation. The constant of integration represents the family of functions with the same derivative.</p><div className="landing-math-fit mt-6 flex min-h-24 items-center overflow-hidden rounded-xl bg-surface-subtle p-5 text-xl text-foreground"><MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} /></div><h4 className="mt-7 text-sm font-bold">Worked example</h4><p className="mt-2 text-sm leading-7 text-muted-foreground">For the polynomial example, increase the exponent to 3 and divide by 3.</p></article></div>;
}

function StudentQuiz() {
  const choices = ['x³ + C', '3x³ + C', 'x² + C', '6x + C'];
  return <div className="min-h-[430px]"><header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-5 sm:px-7"><div><span className="text-[10px] font-semibold text-muted-foreground">Lesson Quiz</span><h3 className="mt-1 text-sm font-bold">Quiz: Indefinite Integration</h3></div><span className="text-xs text-muted-foreground">Question 2 of 5</span></header><div className="max-w-3xl p-5 sm:p-8"><p className="text-sm text-secondary-foreground">Find the antiderivative of the expression below.</p><div className="my-5 rounded-xl bg-surface-subtle p-5 text-center text-xl text-foreground"><MathExpression latex={String.raw`\int 3x^2\,dx`} /></div><div className="grid gap-2">{choices.map((choice, index) => <div key={choice} className={`flex min-h-12 items-center gap-3 rounded-lg border px-4 text-sm ${index === 0 ? 'border-primary bg-primary-subtle text-foreground' : 'border-border text-muted-foreground'}`}><span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] font-bold">{String.fromCharCode(65 + index)}</span>{choice}</div>)}</div></div></div>;
}

function Analytics() {
  return <div className="min-h-[430px]"><header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-5 sm:px-7"><div><span className="text-[10px] text-muted-foreground">Illustrative quiz analytics</span><h3 className="mt-1 text-sm font-bold">Integration and Algebra</h3></div><span className="text-[10px] font-bold text-success">Published</span></header><div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-7">{[['82%', 'Quiz average'], ['91%', 'Submission rate'], ['4/5', 'Median score']].map(([value, label]) => <div key={label} className="border-b border-border py-4 sm:border-b-0 sm:border-r sm:px-4 sm:last:border-r-0"><strong className="block text-3xl tracking-tight">{value}</strong><span className="mt-2 block text-xs text-muted-foreground">{label}</span></div>)}</div><div className="mx-5 mb-6 grid gap-5 rounded-xl border border-border p-5 sm:mx-7">{[['Power rule', 'w-[88%]'], ['Constant of integration', 'w-[72%]'], ['Algebraic simplification', 'w-[64%]']].map(([label, width]) => <div key={label} className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center"><span className="text-xs text-muted-foreground">{label}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><i className={`block h-full rounded-full bg-primary ${width}`} /></div></div>)}</div></div>;
}

function AssistantScene() {
  return (
    <div className="grid min-h-[500px] bg-surface-subtle lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.72fr)]">
      <article className="relative m-3 min-w-0 rounded-xl border border-border bg-card p-5 sm:m-5 sm:p-7 lg:mr-3">
        <span className="text-[10px] font-semibold text-primary-subtle-foreground">SECTION 02 · POWER RULE</span>
        <h3 className="mt-3 font-serif text-2xl text-foreground sm:text-3xl">Integrating polynomial terms</h3>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          For any real exponent n except −1, increase the exponent by one and divide by the new exponent.
        </p>
        <div className="landing-math-fit mt-5 overflow-hidden rounded-xl border border-primary/25 bg-primary-subtle p-5 ring-4 ring-primary/10">
          <div className="text-xl text-foreground"><MathExpression latex={String.raw`\int x^n\,dx=\frac{x^{n+1}}{n+1}+C`} /></div>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">This rule follows directly from reversing the derivative power rule.</p>
        </div>
        <div className="grid gap-3 mt-6 sm:grid-cols-2">
          <div className="h-2 rounded-full bg-muted" />
          <div className="h-2 rounded-full bg-muted" />
          <div className="h-2 rounded-full bg-muted sm:col-span-2" />
        </div>
        <span className="absolute -right-1 top-[176px] hidden rounded-full bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground shadow-lg lg:block">
          Selected passage
        </span>
      </article>

      <aside className="landing-section-dark flex min-w-0 flex-col border-t border-border bg-sidebar text-foreground lg:border-l lg:border-t-0">
        <div className="flex min-h-14 items-center gap-2 border-b border-border px-4">
          <Bot size={16} className="text-primary" />
          <strong className="text-xs">Lesson Assistant</strong>
          <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 p-4 space-y-4 sm:p-5">
          <div className="ml-7 rounded-xl rounded-tr-sm bg-surface-subtle p-3 text-xs leading-5 text-secondary-foreground">
            Make the selected explanation clearer for first-year engineering students.
          </div>
          <div className="mr-4 rounded-xl rounded-tl-sm border border-primary/40 bg-surface p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-primary">
              <Sparkles size={13} /> SUGGESTED REVISION
            </div>
            <p className="mt-3 text-xs leading-6 text-secondary-foreground">
              Think of integration as undoing a derivative: add one to the exponent, then divide by that new value.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-[10px] font-semibold text-primary-foreground">Apply change</span>
              <span className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-[10px] font-semibold text-secondary-foreground">Keep original</span>
            </div>
          </div>
        </div>
        <div className="m-4 flex min-h-11 items-center rounded-xl border border-border bg-surface-subtle px-3 text-[11px] text-muted-foreground">
          Ask for a revision… <MessageSquareText size={14} className="ml-auto" />
        </div>
      </aside>
    </div>
  );
}

const PANELS = { materials: LessonMaterials, assistant: AssistantScene, quiz: StudentQuiz };

export default function ProductPreview() {
  const [activeTab, setActiveTab] = useState('assistant');
  const reducedMotion = useReducedMotion();
  const id = useId();
  const ActivePanel = PANELS[activeTab];

  const selectAdjacentTab = (event, currentIndex) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;

    const nextTab = TABS[nextIndex];
    setActiveTab(nextTab[0]);
    document.getElementById(`${id}-${nextTab[0]}-tab`)?.focus();
  };

  return (
    <section id="product" className={`landing-section-dark ${landingStyles.section} relative overflow-clip bg-background text-foreground`}>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -right-[18%] top-[8%] h-[620px] w-[620px] rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute bottom-0 left-[18%] h-px w-[64%] bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
      </div>

      <div className={`${landingStyles.container} relative grid items-center gap-10 lg:grid-cols-[0.34fr_0.66fr] lg:gap-14 xl:gap-20`}>
        <motion.header
          initial={reducedMotion ? false : { opacity: 0, x: -26 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
        >
          <p className={landingStyles.eyebrowLight}>Generate</p>
          <h2 className={`${landingStyles.heading} mt-5 max-w-[10ch]`}> AI helps build it. You decide what stays.</h2>
          <p className={`${landingStyles.bodyLight} mt-7 max-w-[31rem]`}>
            Turn reviewed classroom context into structured notes, refine every passage, and author a lesson-grounded quiz without leaving the workspace.
          </p>
          <div className="mt-9 hidden items-center gap-3 text-xs text-muted-foreground lg:flex">
            <span className="h-px w-10 bg-primary" /> One connected authoring flow
          </div>
        </motion.header>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={landingMotion.viewport}
          transition={reducedMotion ? { duration: 0 } : landingMotion.reveal}
          className="min-w-0"
        >
          <GlowCard tilt className="rounded-[22px] border-border bg-card shadow-[0_45px_130px_-60px_rgba(0,0,0,0.78)]">
            <div className="flex min-h-14 items-center gap-3 border-b border-border px-3 sm:px-5">
              <div className="hidden gap-1.5 sm:flex" aria-hidden="true">
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <span className="w-2 h-2 rounded-full bg-white/20" />
              </div>
              <div role="tablist" aria-label="Instructor authoring workspace preview" className="landing-scroll-strip flex min-w-0 flex-1 gap-1 overflow-x-auto py-1">
                {TABS.map(([key, label], index) => {
                  const selected = activeTab === key;
                  return (
                    <button
                      key={key}
                      id={`${id}-${key}-tab`}
                      type="button"
                      role="tab"
                      tabIndex={selected ? 0 : -1}
                      aria-selected={selected}
                      aria-controls={`${id}-${key}-panel`}
                      onClick={() => setActiveTab(key)}
                      onKeyDown={event => selectAdjacentTab(event, index)}
                      className={`relative min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4 ${selected ? 'text-foreground' : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'}`}
                    >
                      {label}
                      {selected && (
                        <motion.span
                          layoutId={`${id}-active-product-tab`}
                          className="absolute inset-x-3 -bottom-[5px] h-0.5 rounded-full bg-primary"
                          transition={reducedMotion ? { duration: 0 } : { duration: 0.25, ease: landingMotion.ease }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                id={`${id}-${activeTab}-panel`}
                role="tabpanel"
                aria-labelledby={`${id}-${activeTab}-tab`}
                className="landing-section-light min-h-[500px] bg-card text-foreground"
                initial={reducedMotion ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                transition={{ duration: reducedMotion ? 0 : 0.28, ease: landingMotion.ease }}
              >
                <ActivePanel />
              </motion.div>
            </AnimatePresence>
          </GlowCard>

          <div className="mt-4 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>Illustrative SEA-IT-SOLVED workspace</span>
            <span className="hidden sm:inline">Human-reviewed · Math-aware · Editable</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
