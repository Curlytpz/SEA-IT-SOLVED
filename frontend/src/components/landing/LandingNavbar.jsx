import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import MagneticButton from './MagneticButton';
import { landingMotion, landingStyles } from './landingStyles';
import { BrandLogo } from '../brand/BrandLogo';

const NAV_LINKS = [
  ['How it works', '#how-it-works'],
  ['Instructors', '#instructors'],
  ['Students', '#students'],
];

export function BrandLink({ className = '', tone = 'light', tagline = false }) {
  return (
    <Link
      to="/"
      className={`group inline-flex min-h-11 items-center rounded-xl text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
      aria-label="SEA-IT-SOLVED home"
    >
      <BrandLogo size="md" tone={tone} tagline={tagline} />
    </Link>
  );
}

export default function LandingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const mobileScrollTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(mobileScrollTimer.current), []);

  function scrollToSection(href) {
    const target = document.querySelector(href);
    if (!target) return;
    target.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function handleSectionClick(event, href, fromMobile = false) {
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();

    if (fromMobile && menuOpen) {
      setMenuOpen(false);
      window.clearTimeout(mobileScrollTimer.current);
      mobileScrollTimer.current = window.setTimeout(
        () => scrollToSection(href),
        reducedMotion ? 0 : 240,
      );
      return;
    }

    scrollToSection(href);
  }

  return (
    <header className="landing-section-dark sticky top-0 z-50 border-b border-border bg-background/90 text-foreground shadow-[0_14px_36px_-32px_rgba(0,0,0,0.72)] backdrop-blur-xl">
      <div className={`${landingStyles.container} flex min-h-[72px] items-center justify-between gap-4`}>
        <BrandLink />

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center rounded-full border border-border bg-surface-subtle/75 p-1 lg:flex" aria-label="Public navigation">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href} onClick={event => handleSectionClick(event, href)} className="group relative inline-flex min-h-10 items-center rounded-full px-4 text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="absolute inset-0 scale-95 rounded-full bg-surface-elevated opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100" />
              <span className="relative">{label}</span>
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link to="/login" className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-secondary-foreground transition-colors duration-200 hover:bg-surface-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex">Sign In</Link>
          <MagneticButton strength={12} className="hidden sm:inline-block">
            <Link to="/register/student" className={`${landingStyles.primaryButton} group min-h-11 px-5`}>
              Get Started
              <ArrowUpRight size={15} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </MagneticButton>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-secondary-foreground transition-colors duration-200 hover:bg-surface-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="landing-mobile-navigation" onClick={() => setMenuOpen(value => !value)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {!reducedMotion && <motion.div aria-hidden="true" style={{ scaleX: scrollYProgress }} className="h-px w-full origin-left bg-gradient-to-r from-primary via-primary-hover to-primary/45" />}

      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.nav id="landing-mobile-navigation" className={`${landingStyles.container} border-t border-border pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden`} aria-label="Mobile public navigation" initial={reducedMotion ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={{ duration: reducedMotion ? 0 : 0.24, ease: landingMotion.ease }}>
            {NAV_LINKS.map(([label, href]) => (
              <a key={href} href={href} onClick={event => handleSectionClick(event, href, true)} className="flex min-h-12 items-center justify-between rounded-xl px-3 text-sm font-semibold text-secondary-foreground hover:bg-surface-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {label}<ArrowUpRight size={15} className="text-primary" aria-hidden="true" />
              </a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
              <Link to="/login" className="flex min-h-12 items-center justify-center rounded-full border border-border text-sm font-bold text-foreground">Sign In</Link>
              <Link to="/register/student" className="flex min-h-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">Get Started</Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
