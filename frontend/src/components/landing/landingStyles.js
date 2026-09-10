export const landingStyles = {
  container: 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8',
  section: 'py-20 sm:py-24 lg:py-28',
  display: 'text-[clamp(3rem,6vw,6.5rem)] font-semibold leading-[0.91] tracking-[-0.06em] text-balance',
  heading: 'text-[clamp(2.75rem,5vw,5.5rem)] font-semibold leading-[0.93] tracking-[-0.055em] text-balance',
  bodyDark: 'text-base leading-7 text-secondary-foreground sm:text-lg sm:leading-8',
  bodyLight: 'text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8',
  eyebrowDark: 'text-sm font-semibold text-primary-subtle-foreground',
  eyebrowLight: 'text-sm font-semibold text-primary',
  primaryButton: 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  darkSecondaryButton: 'inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-bold text-foreground transition-colors duration-200 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  lightSecondaryButton: 'inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-bold text-foreground transition-colors duration-200 hover:border-primary hover:bg-primary-subtle hover:text-primary-subtle-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  darkSurface: 'overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_42px_120px_-62px_rgba(0,0,0,0.72)]',
  lightSurface: 'overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_38px_100px_-62px_rgba(15,23,42,0.24)]',
};

export const landingMotion = {
  ease: [0.16, 1, 0.3, 1],
  reveal: { duration: 0.66, ease: [0.16, 1, 0.3, 1] },
  viewport: { once: true, amount: 0.32, margin: '0px 0px -8% 0px' },
  largeViewport: { once: true, amount: 0.22, margin: '0px 0px -10% 0px' },
  cardViewport: { once: true, amount: 0.42, margin: '0px 0px -6% 0px' },
  stagger: {
    hidden: {},
    visible: { transition: { delayChildren: 0.04, staggerChildren: 0.09 } },
  },
  textReveal: {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.66, ease: [0.16, 1, 0.3, 1] } },
  },
  contentReveal: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  },
  visualReveal: {
    hidden: { opacity: 0, y: 30, scale: 0.99 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.72, ease: [0.16, 1, 0.3, 1] } },
  },
};
