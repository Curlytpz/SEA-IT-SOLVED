import { useRef } from 'react';
import FeatureGrid from '../components/landing/FeatureGrid';
import FinalCTA from '../components/landing/FinalCTA';
import HeroSection from '../components/landing/HeroSection';
import HowItWorks from '../components/landing/HowItWorks';
import InstructorWorkspace from '../components/landing/InstructorWorkspace';
import LandingFooter from '../components/landing/LandingFooter';
import LandingNavbar from '../components/landing/LandingNavbar';
import ProductPreview from '../components/landing/ProductPreview';
import ScrollStatement from '../components/landing/ScrollStatement';
import StudentExperience from '../components/landing/StudentExperience';
import { useLandingPageAnimations } from '../components/landing/animation/useLandingAnimations';

export default function Landing() {
  const pageRef = useRef(null);
  useLandingPageAnimations(pageRef);

  return (
    <div ref={pageRef} className="landing-page min-w-0 overflow-x-clip bg-background text-foreground">
      <LandingNavbar />
      <main>
        <HeroSection />
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
