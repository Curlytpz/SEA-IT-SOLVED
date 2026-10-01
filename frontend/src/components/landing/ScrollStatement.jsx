import { useRef } from 'react';
import { landingStyles } from './landingStyles';

export default function ScrollStatement() {
  const sectionRef = useRef(null);

  return (
    <section ref={sectionRef} className="landing-statement landing-section-dark" aria-labelledby="landing-scroll-statement">
      <div className="landing-story-handoff" aria-hidden="true" />
      <div className="landing-statement-sticky">
        <div className={`${landingStyles.container} landing-statement-content`}>
          <p className={landingStyles.eyebrowLight}>From the classroom</p>
          <h2 id="landing-scroll-statement" data-landing-reveal className="landing-statement-copy">
            Every lecture contains <span className="text-primary">knowledge worth</span> keeping.
          </h2>
        </div>
      </div>
    </section>
  );
}
