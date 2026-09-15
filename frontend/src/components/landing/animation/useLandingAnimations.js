import { useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const CONDITIONS = {
  desktop: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
  mobile: '(max-width: 1023px) and (prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
};

export function useLandingGsap(scope, setup, dependencies = []) {
  useLayoutEffect(() => {
    if (!scope.current) return undefined;

    let media;
    const context = gsap.context(() => {
      media = gsap.matchMedia();
      media.add(CONDITIONS, matchContext => setup({
        gsap,
        ScrollTrigger,
        ...matchContext.conditions,
      }));
    }, scope);

    return () => {
      media?.revert();
      context.revert();
    };
  }, dependencies);
}

export function useLandingPageAnimations(scope) {
  useLandingGsap(scope, ({ gsap: animation, desktop, mobile, reduce }) => {
    const revealItems = animation.utils.toArray('[data-landing-reveal]')
      .filter(element => !element.classList.contains('landing-scroll-word'));
    const productViews = animation.utils.toArray('[data-landing-product]');
    const editorialCards = animation.utils.toArray('[data-landing-card]');
    const wordmarks = animation.utils.toArray('[data-landing-wordmark]');
    const statements = animation.utils.toArray('.landing-statement');
    const statementWords = statements.flatMap(statement => animation.utils.toArray('.landing-scroll-word', statement));
    const animatedItems = [...revealItems, ...productViews, ...editorialCards, ...wordmarks, ...statementWords];

    if (reduce) {
      animation.set(animatedItems, { clearProps: 'all', autoAlpha: 1 });
      return undefined;
    }

    statements.forEach(statement => {
      const words = animation.utils.toArray('.landing-scroll-word', statement);
      if (!words.length) return;

      animation.timeline({
        scrollTrigger: {
          trigger: statement,
          start: 'top top+=72',
          end: 'bottom bottom',
          scrub: desktop ? 0.45 : 0.25,
        },
      }).fromTo(words,
        {
          opacity: 0.13,
          filter: `blur(${mobile ? 2.5 : 3}px)`,
          y: mobile ? 6 : 8,
        },
        {
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          duration: 0.22,
          stagger: 0.15,
          ease: 'none',
        });
    });

    const distance = desktop ? 36 : 22;
    revealItems.forEach(element => {
      animation.fromTo(element,
        { autoAlpha: 0, y: distance, filter: 'blur(7px)' },
        {
          autoAlpha: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: desktop ? .9 : .68,
          ease: 'power3.out',
          scrollTrigger: { trigger: element, start: mobile ? 'top 90%' : 'top 84%', once: true },
        });
    });

    productViews.forEach(element => {
      animation.fromTo(element,
        { autoAlpha: 0, y: desktop ? 54 : 28, scale: desktop ? .93 : .97, clipPath: 'inset(5% 4% round 28px)' },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clipPath: 'inset(0% 0% round 0px)',
          ease: 'none',
          scrollTrigger: {
            trigger: element,
            start: mobile ? 'top 94%' : 'top 91%',
            end: mobile ? 'top 58%' : 'top 48%',
            scrub: desktop ? .8 : .55,
          },
        });
    });

    editorialCards.forEach((element, index) => {
      animation.fromTo(element,
        { autoAlpha: 0, y: mobile ? 18 : 26 },
        {
          autoAlpha: 1,
          y: 0,
          duration: .62,
          delay: desktop ? (index % 2) * .06 : 0,
          ease: 'power3.out',
          scrollTrigger: { trigger: element, start: 'top 90%', once: true },
        });
    });

   wordmarks.forEach(element => {
  animation.fromTo(
    element,
    {
      autoAlpha: 0,
      y: desktop ? 70 : 34,
    },
    {
      autoAlpha: 1,
      y: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start: 'top 96%',
        end: 'top 66%',
        scrub: desktop ? .8 : .55,
      },
    }
  );

      const giantWordmark = element.querySelector('.landing-interactive-wordmark.is-giant');

      if (mobile && giantWordmark) {
        animation.fromTo(giantWordmark,
          { '--wordmark-light-x': '-18%' },
          {
            '--wordmark-light-x': '118%',
            ease: 'none',
            scrollTrigger: {
              trigger: element,
              start: 'top 96%',
              end: 'bottom 42%',
              scrub: .7,
            },
          });
      }
    });

    return undefined;
  }, []);
}

export { gsap, ScrollTrigger };
