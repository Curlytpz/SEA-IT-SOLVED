import { useRef } from 'react';
import { useLandingGsap } from './animation/useLandingAnimations';

// One continuous atmosphere, composed of individually placed sections of light.
// Product and feature sections bridge the named story beats rather than resetting it.
const AURORA_SECTIONS = [
  { selector: '#top', variant: 'hero', drift: 24, duration: 28 },
  { selector: '.landing-statement', variant: 'story', drift: -22, duration: 33 },
  { selector: '#how-it-works', variant: 'workflow', drift: 28, duration: 30 },
  { selector: '#instructors', variant: 'instructors', drift: -20, duration: 26 },
  { selector: '#product', variant: 'product', drift: 18, duration: 34 },
  { selector: '#students', variant: 'students', drift: 25, duration: 31 },
  { selector: '#features', variant: 'features', drift: -18, duration: 29 },
  { selector: '.landing-final-cta', variant: 'cta', drift: 20, duration: 35 },
  { selector: '.landing-footer', variant: 'footer', drift: 0, duration: 0 },
];

function AuroraField({ variant }) {
  const segments = variant === 'workflow' ? 6 : 1;
  return (
    <div className="landing-aurora-field" data-aurora-variant={variant}>
      {Array.from({ length: segments }, (_, index) => (
        <div className="landing-aurora-anchor" data-aurora-segment={index} key={index}>
          <div className="landing-aurora-scroll">
            <div className="landing-aurora-light" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LandingAtmosphere() {
  const atmosphereRef = useRef(null);

  useLandingGsap(atmosphereRef, ({ gsap, ScrollTrigger, mobile, reduce }) => {
    const atmosphere = atmosphereRef.current;
    const page = atmosphere.closest('.landing-page');
    if (!page) return undefined;

    const fields = AURORA_SECTIONS.map((item, index) => ({
      ...item,
      section: page.querySelector(item.selector),
      field: atmosphere.querySelectorAll('.landing-aurora-field')[index],
    })).filter(item => item.section && item.field);

    const placeFields = () => {
      const pageTop = page.getBoundingClientRect().top + window.scrollY;
      const bleed = mobile ? 90 : 150;
      fields.forEach(({ section, field }) => {
        const bounds = section.getBoundingClientRect();
        gsap.set(field, {
          top: bounds.top + window.scrollY - pageTop - bleed,
          height: bounds.height + bleed * 2,
        });
      });
    };

    placeFields();
    const resizeObserver = new ResizeObserver(placeFields);
    resizeObserver.observe(page);
    fields.forEach(({ section }) => resizeObserver.observe(section));
    ScrollTrigger.addEventListener('refresh', placeFields);

    if (reduce) {
      return () => {
        resizeObserver.disconnect();
        ScrollTrigger.removeEventListener('refresh', placeFields);
      };
    }

    fields.forEach(({ section, field, drift, duration }, index) => {
      if (!duration) return;
      const lights = field.querySelectorAll('.landing-aurora-light');
      const scrollLayers = field.querySelectorAll('.landing-aurora-scroll');

      const ambient = gsap.fromTo(lights,
        { xPercent: -1.5, yPercent: 1, scaleX: .985, scaleY: 1.015, rotation: -.65 },
        {
          xPercent: 2.5,
          yPercent: -1.5,
          scaleX: 1.025,
          scaleY: .985,
          rotation: .7,
          duration: duration * (mobile ? 1.2 : 1),
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: -index * 2.3,
          stagger: 1.2,
        });

      const bounds = section.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) ambient.pause();
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onEnter: () => ambient.resume(),
        onEnterBack: () => ambient.resume(),
        onLeave: () => ambient.pause(),
        onLeaveBack: () => ambient.pause(),
      });

      gsap.fromTo(scrollLayers,
        { y: -(mobile ? drift * .45 : drift) },
        {
          y: mobile ? drift * .45 : drift,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: .6,
          },
        });
    });

    return () => {
      resizeObserver.disconnect();
      ScrollTrigger.removeEventListener('refresh', placeFields);
    };
  }, []);

  return (
    <div ref={atmosphereRef} className="landing-atmosphere" aria-hidden="true">
      <div className="landing-atmosphere-grain" />
      {AURORA_SECTIONS.map(({ variant }) => <AuroraField key={variant} variant={variant} />)}
    </div>
  );
}
