import { useRef } from 'react';
import { landingStyles } from './landingStyles';

const WORDS = [
  ['Every', false],
  ['lecture', false],
  ['contains', false],
  ['knowledge', true],
  ['worth', true],
  ['keeping.', false],
];

export default function ScrollStatement() {
  const sectionRef = useRef(null);

  return (
    <section ref={sectionRef} className="landing-statement landing-section-dark" aria-labelledby="landing-scroll-statement">
      <div className="landing-story-handoff" aria-hidden="true" />
      <div className="landing-statement-sticky">
        <div className={`${landingStyles.container} landing-statement-content`}>
          <p className={landingStyles.eyebrowLight}>From the classroom</p>
          <h2 id="landing-scroll-statement" className="landing-statement-copy" aria-label="Every lecture contains knowledge worth keeping.">
            {WORDS.map(([word, accent], index) => (
              <span key={`${word}-${index}`} aria-hidden="true" className={`landing-scroll-word${accent ? ' is-accent' : ''}`}>{word}</span>
            ))}
          </h2>
        </div>
      </div>
    </section>
  );
}
