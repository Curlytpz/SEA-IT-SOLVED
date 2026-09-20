import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import landingWhiteboard from '../../assets/landing-whiteboard.jpg';
import GlowCard from './GlowCard';
import MagneticButton from './MagneticButton';
import WaveBackground from './WaveBackground';
import { landingStyles } from './landingStyles';

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

      <div className="landing-hero-workspace-main grid min-h-[300px] bg-background sm:min-h-[440px] lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative grid min-w-0 overflow-hidden place-items-center bg-background">
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(circle at 60% 30%, hsl(var(--primary) / 0.09), transparent 56%)' }} />
          <img src={landingWhiteboard} alt="Classroom whiteboard filled with handwritten calculus examples" width="720" height="360" fetchPriority="high" decoding="async" className="landing-hero-workspace-capture relative z-10 h-full max-h-[440px] w-full object-contain" />
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

export default function HeroSection({ introComplete = false }) {
  return (
    <section id="top" data-hero-ready={introComplete ? 'true' : 'false'} className="relative landing-hero landing-section-dark isolate bg-sidebar text-foreground">
      <WaveBackground interactive />

      <div className={`${landingStyles.container} landing-hero-grid relative grid min-h-[calc(100svh-72px)] items-center gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12 lg:py-24 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] xl:gap-16`}>
        <div className="relative z-20 min-w-0 max-w-[680px] lg:max-w-[560px] lg:pb-12">
          <p data-hero-reveal className="mb-7 flex items-center gap-3 text-xs font-semibold tracking-[0.08em] text-primary sm:text-sm">
            <span className="w-8 h-px bg-primary" aria-hidden="true" />SEA-IT-SOLVED · AI-ASSISTED WORKSPACE
          </p>

          <h1 className="max-w-full text-[clamp(3rem,10vw,4rem)] font-semibold leading-[0.86] tracking-[-0.07em] text-balance sm:text-[clamp(4rem,8vw,7rem)] lg:text-[clamp(3.8rem,5vw,5.7rem)]">
              <span data-hero-reveal className="block">Classroom</span>
  <span data-hero-reveal className="block">intelligence,</span>

  <span data-hero-reveal className="block mt-7 text-primary">
    built for future
  </span>

  <span data-hero-reveal className="block text-primary">
    engineers.
  </span>
</h1>

          <p data-hero-reveal className="mt-8 max-w-[590px] text-base leading-7 text-secondary-foreground sm:text-lg sm:leading-8">
            Capture classroom mathematics, review recognized context, and turn instructor-approved lessons into notes, quizzes, and continued learning after class.
          </p>

          <div data-hero-reveal className="flex flex-col gap-3 mt-9 sm:flex-row">
            <MagneticButton strength={14} className="w-full sm:w-auto">
              <Link to="/register/student" className={`${landingStyles.primaryButton} group w-full sm:w-auto`}>Get Started<ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" /></Link>
            </MagneticButton>
            <Link to="/login" className={`${landingStyles.darkSecondaryButton} w-full sm:w-auto`}>Sign In</Link>
          </div>

          <p data-hero-reveal className="mt-6 text-xs leading-5 text-muted-foreground sm:text-sm">
            Whiteboard capture · Human review · Math-aware learning
          </p>
        </div>

        <div className="landing-hero-product relative z-10 w-full min-w-0">
          <div className="relative [perspective:1400px]">
            <div aria-hidden="true" className="absolute -inset-5 rounded-[36px] blur-xl" style={{ background: 'radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.13), transparent 70%)' }} />
            <ProductWindow />
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
