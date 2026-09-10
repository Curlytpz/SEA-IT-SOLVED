import { motion, useReducedMotion } from 'framer-motion';
import FeatureGrid from '../components/landing/FeatureGrid';
import FinalCTA from '../components/landing/FinalCTA';
import HeroSection from '../components/landing/HeroSection';
import HowItWorks from '../components/landing/HowItWorks';
import InstructorWorkspace from '../components/landing/InstructorWorkspace';
import LandingFooter from '../components/landing/LandingFooter';
import LandingNavbar from '../components/landing/LandingNavbar';
import ProductPreview from '../components/landing/ProductPreview';
import StudentExperience from '../components/landing/StudentExperience';
import { landingMotion, landingStyles } from '../components/landing/landingStyles';

function EditorialInterlude() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="landing-section-dark relative overflow-clip bg-card py-24 text-foreground sm:py-28 lg:py-36">
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2" style={{ background: 'radial-gradient(ellipse, hsl(var(--primary) / 0.11), transparent 68%)' }} />
      <motion.div
        initial={reducedMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={landingMotion.viewport}
        variants={reducedMotion ? undefined : landingMotion.stagger}
        className={`relative ${landingStyles.container}`}
      >
        <motion.div variants={reducedMotion ? undefined : landingMotion.textReveal}>
          <p className={landingStyles.eyebrowLight}>Human review, by design</p>
          <p className="mt-7 max-w-[15ch] text-[clamp(3.1rem,7vw,7.6rem)] font-semibold leading-[0.89] tracking-[-0.065em] text-balance">
            Only approved context moves forward.
          </p>
        </motion.div>
        <motion.div
          aria-hidden="true"
          variants={reducedMotion ? undefined : {
            hidden: { scaleX: 0 },
            visible: { scaleX: 1, transition: { duration: 0.8, ease: landingMotion.ease } },
          }}
          className="mt-12 h-px max-w-4xl origin-left bg-gradient-to-r from-primary via-primary/45 to-transparent"
        />
      </motion.div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="landing-page min-w-0 overflow-x-clip bg-background text-foreground">
      <LandingNavbar />
      <main>
        <HeroSection />
        <HowItWorks />
        <EditorialInterlude />
        <InstructorWorkspace />
        <ProductPreview />
        <StudentExperience />
        <FeatureGrid />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
