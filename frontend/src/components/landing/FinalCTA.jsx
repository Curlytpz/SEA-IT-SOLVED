import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import MagneticButton from './MagneticButton';
import WaveBackground from './WaveBackground';
import { landingStyles } from './landingStyles';

export default function FinalCTA() {
  return (
    <section className="landing-final-cta landing-section-dark landing-noise relative overflow-clip bg-background py-24 text-foreground sm:py-28 lg:py-36">
      <WaveBackground compact />
      <div data-landing-reveal className={`relative grid gap-12 lg:grid-cols-[1.35fr_0.65fr] lg:items-end ${landingStyles.container}`}>
        <div>
          <p className={landingStyles.eyebrowLight}>The classroom continues</p>
          <h2 className={`mt-6 max-w-[13ch] ${landingStyles.display}`}>Turn every lecture into something students can revisit.</h2>
        </div>

        <div className="lg:pb-2">
          <p className={landingStyles.bodyLight}>Explore the system, then enter the workspace built for your role.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <MagneticButton className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <a href="#how-it-works" className={`w-full ${landingStyles.primaryButton}`}>
                Explore SEA-IT-SOLVED <ArrowRight size={17} />
              </a>
            </MagneticButton>
            <Link to="/login?role=student" className={landingStyles.darkSecondaryButton}>Student Login</Link>
            <Link to="/login?role=instructor" className={landingStyles.darkSecondaryButton}>Instructor Login</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
