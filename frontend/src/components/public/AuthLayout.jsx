import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createStaggerContainer } from '../../lib/motionVariants';
import ThemeToggle from '../ThemeToggle';
import AmbientMathScene from '../landing/AmbientMathScene';
import { BrandLink } from '../landing/LandingNavbar';

const VALUE_POINTS = [
  'Capture mathematics lessons',
  'Review recognized academic content',
  'Publish approved learning materials',
];

const AUTH_EASE = [0.16, 1, 0.3, 1];
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
        ? 'auth-login-container mx-auto grid w-full overflow-hidden text-foreground md:grid-cols-[42%_58%] lg:grid-cols-[44%_56%]'
        : 'mx-auto grid min-h-svh w-full max-w-[1680px] overflow-hidden bg-card text-foreground shadow-[0_24px_80px_-48px_rgba(15,23,42,.34)] md:grid-cols-[42%_58%] lg:grid-cols-[44%_56%] xl:my-6 xl:min-h-[calc(100svh-3rem)] xl:rounded-2xl'}
    >
      <section className={`relative isolate hidden min-h-0 flex-col overflow-hidden p-8 text-sidebar-foreground md:flex lg:p-10 xl:p-12 ${loginExperience ? 'auth-login-visual' : 'bg-sidebar'}`} aria-labelledby={visualTitleId}>
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

      <section className={`flex min-w-0 flex-col border-border bg-card md:min-h-0 md:border-l ${loginExperience ? 'auth-login-form-panel min-h-0' : 'min-h-svh'}`} aria-labelledby={formTitleId}>
        <div className="flex min-h-16 items-center justify-between px-4 sm:px-6 md:px-8 lg:px-10">
          <Link to={backTo} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={16} />{backLabel}</Link>
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
    ? <div className="auth-login-page"><AmbientMathScene compact restrained symbolsOnly outer />{authContainer}</div>
    : authContainer;
}
