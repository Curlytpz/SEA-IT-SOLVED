import { useLayoutEffect, useRef, useState } from 'react';
import FeatureGrid from '../components/landing/FeatureGrid';
import FinalCTA from '../components/landing/FinalCTA';
import HeroSection from '../components/landing/HeroSection';
import HowItWorks from '../components/landing/HowItWorks';
import InstructorWorkspace from '../components/landing/InstructorWorkspace';
import LandingFooter from '../components/landing/LandingFooter';
import LandingNavbar from '../components/landing/LandingNavbar';
import ProductPreview from '../components/landing/ProductPreview';
import ScrollScrubIntro from '../components/landing/ScrollScrubIntro';
import ScrollStatement from '../components/landing/ScrollStatement';
import StudentExperience from '../components/landing/StudentExperience';
import { useLandingPageAnimations } from '../components/landing/animation/useLandingAnimations';

export default function Landing() {
  const pageRef = useRef(null);
  const [heroReady, setHeroReady] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  useLandingPageAnimations(pageRef);
  useLayoutEffect(() => {
    document.documentElement.classList.add('landing-boot');
    return () => document.documentElement.classList.remove('landing-boot', 'landing-boot-complete');
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('landing-boot-complete', entryReady);
  }, [entryReady]);

  return (
    <div ref={pageRef} data-entry-ready={entryReady ? 'true' : 'false'} className="landing-page min-w-0 overflow-x-clip bg-background text-foreground">
      <LandingNavbar />
      <main>
        <ScrollScrubIntro onEntryReady={setEntryReady} onHeroReadyChange={setHeroReady} />
        <HeroSection introComplete={heroReady} />
        <ScrollStatement />
        <HowItWorks />
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
