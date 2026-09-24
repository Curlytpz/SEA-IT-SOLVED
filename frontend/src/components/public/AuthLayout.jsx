import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { createStaggerContainer } from '../../lib/motionVariants';
import ThemeToggle from '../ThemeToggle';
import { BackButton } from '../ui';
import AmbientMathScene from '../landing/AmbientMathScene';
import { BrandLink } from '../landing/LandingNavbar';

const VALUE_POINTS = [
  'Capture mathematics lessons',
  'Review recognized academic content',
  'Publish approved learning materials',
];

const AUTH_EASE = [0.16, 1, 0.3, 1];
const AUTH_LOGIN_PAGE_STYLES = `relative isolate flex min-h-svh items-center justify-center overflow-hidden
  bg-[radial-gradient(ellipse_at_50%_48%,rgba(255,255,255,.82)_0%,rgba(255,255,255,.48)_34%,transparent_68%),radial-gradient(ellipse_80%_42%_at_94%_3%,hsl(var(--primary)/.14),transparent_68%),radial-gradient(ellipse_76%_36%_at_-8%_104%,hsl(var(--primary)/.1),transparent_70%),radial-gradient(ellipse_at_72%_4%,rgba(148,163,184,.1),transparent_28rem),radial-gradient(ellipse_at_50%_50%,transparent_54%,hsl(var(--primary)/.045)_100%),hsl(var(--background))]
  p-[clamp(1rem,3vw,2.5rem)] before:pointer-events-none before:absolute before:inset-0 before:-z-[1]
  before:bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(15,23,42,.035)_100%)] before:content-['']
  after:pointer-events-none after:absolute after:inset-0 after:z-0 after:bg-[url("data:image/svg+xml,%3Csvg_xmlns='http://www.w3.org/2000/svg'_width='220'_height='220'_viewBox='0_0_220_220'%3E%3Cfilter_id='grain'%3E%3CfeTurbulence_type='fractalNoise'_baseFrequency='.72'_numOctaves='3'_stitchTiles='stitch'/%3E%3C/filter%3E%3Crect_width='100%25'_height='100%25'_filter='url(%23grain)'_opacity='.26'/%3E%3C/svg%3E")]
  after:bg-[length:220px_220px] after:opacity-[.052] after:content-['']
  dark:bg-[radial-gradient(ellipse_85%_38%_at_92%_4%,hsl(var(--primary)/.07),transparent_70%),hsl(var(--background))]
  max-md:items-start max-md:overflow-y-auto max-md:bg-background max-md:p-0 max-md:before:hidden max-md:after:opacity-[.04] dark:max-md:bg-background`;
const authFadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.46, ease: AUTH_EASE } },
};

export default function AuthLayout({ title, subtitle, panelTitle, panelBody, children, status, backTo = '/', backLabel = 'Home', loginExperience = false }) {
  const reducedMotion = useReducedMotion();
  const formTitleId = useId();
  const visualTitleId = useId();

  const authContainer = (
    <motion.main
      initial={loginExperience && !reducedMotion ? { opacity: 0, scale: 0.985, y: 10 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.5, ease: AUTH_EASE }}
      className={loginExperience
        ? 'relative z-[1] mx-auto grid min-h-[min(710px,calc(100svh-3rem))] w-full max-w-[1240px] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_24px_64px_-42px_rgba(15,23,42,.36),0_8px_24px_-20px_rgba(30,41,59,.18)] max-md:min-h-svh max-md:rounded-none max-md:border-0 max-md:shadow-none md:grid-cols-[42%_58%] lg:grid-cols-[44%_56%]'
        : 'mx-auto grid min-h-svh w-full max-w-[1680px] overflow-hidden bg-card text-foreground shadow-[0_24px_80px_-48px_rgba(15,23,42,.34)] md:grid-cols-[42%_58%] lg:grid-cols-[44%_56%] xl:my-6 xl:min-h-[calc(100svh-3rem)] xl:rounded-2xl'}
    >
      <section className={`relative isolate hidden min-h-0 flex-col overflow-hidden p-8 text-sidebar-foreground md:flex lg:p-10 xl:p-12 ${loginExperience ? "bg-[linear-gradient(145deg,hsl(var(--sidebar))_0%,hsl(var(--surface))_100%)] after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:bg-[linear-gradient(110deg,transparent_48%,hsl(var(--primary)/.025)_100%)] after:content-['']" : 'bg-sidebar'}`} aria-labelledby={visualTitleId}>
        <AmbientMathScene compact restrained={loginExperience} interactive={!loginExperience} />
        <div className="relative z-10 hidden md:block"><BrandLink tone="auto" tagline /></div>
        <motion.div initial={reducedMotion ? false : 'hidden'} animate="visible" variants={createStaggerContainer(0.09, 0.08)} className="relative z-10 my-auto max-w-xl py-12 text-left">
          <motion.h2 id={visualTitleId} variants={authFadeUp} className="max-w-[12ch] text-[clamp(2.1rem,4vw,4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance">{panelTitle}</motion.h2>
          <motion.p variants={authFadeUp} className="mt-4 hidden max-w-[60ch] text-sm leading-7 text-secondary-foreground md:block lg:text-base">{panelBody}</motion.p>
          <motion.ul variants={createStaggerContainer(0.12, 0.07)} className="mt-6 hidden gap-3 md:grid" aria-label="Platform workflow">
            {VALUE_POINTS.map(point => <motion.li key={point} variants={authFadeUp} className="flex items-center gap-3 text-sm text-secondary-foreground"><CheckCircle2 size={16} className="text-primary" />{point}</motion.li>)}
          </motion.ul>
        </motion.div>
        <p className="relative z-10 hidden text-xs text-muted-foreground md:block">Academic intelligence for the classroom</p>
      </section>

      <section className={`flex min-w-0 flex-col border-border bg-card md:min-h-0 md:border-l ${loginExperience ? 'min-h-0 bg-[radial-gradient(ellipse_70%_32%_at_108%_-4%,hsl(var(--primary)/.035),transparent_72%),hsl(var(--card))] dark:bg-[radial-gradient(ellipse_70%_32%_at_108%_-4%,hsl(var(--primary)/.06),transparent_72%),hsl(var(--card))]' : 'min-h-svh'}`} aria-labelledby={formTitleId}>
        <div className="flex min-h-16 items-center justify-between px-4 sm:px-6 md:px-8 lg:px-10">
          <BackButton to={backTo} className="mb-0">{backLabel}</BackButton>
          <ThemeToggle compact />
        </div>
        <div className="px-4 pb-3 text-center md:hidden"><BrandLink tone="auto" className="justify-center" /><p className="mt-1 text-xs text-muted-foreground">{loginExperience ? 'Smart Whiteboard for Mathematics' : 'AI-Assisted Smart Whiteboard for Mathematics'}</p></div>
        <div className="flex w-full flex-1 items-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 md:py-10 lg:pl-12 lg:pr-8 xl:pl-16 xl:pr-10">
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, ease: AUTH_EASE }} className="mx-auto w-full max-w-[28rem] md:ml-0 md:mr-auto">
            {status}
            <header><h1 id={formTitleId} className="text-[clamp(1.85rem,3vw,2.6rem)] font-bold tracking-[-0.035em] text-foreground">{title}</h1>{subtitle && <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted-foreground">{subtitle}</p>}</header>
            {children}
          </motion.div>
        </div>
      </section>
    </motion.main>
  );

  return loginExperience
    ? <div className={AUTH_LOGIN_PAGE_STYLES}><AmbientMathScene compact restrained symbolsOnly outer />{authContainer}</div>
    : authContainer;
}
