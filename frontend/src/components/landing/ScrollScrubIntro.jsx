import { useEffect, useRef } from 'react';
import { ArrowDown } from 'lucide-react';
import { useLandingGsap } from './animation/useLandingAnimations';

const VIDEO_DESKTOP_SRC = '/videos/sea-it-solved-capture-clear-1080p.mp4';
const VIDEO_MOBILE_SRC = '/videos/sea-it-solved-capture-clear-720p.mp4';
const POSTER_SRC = '/videos/sea-it-solved-capture-clear-poster.webp';
// The footage is 30 fps; sub-frame seeks only repeat the same decoded image.
const SEEK_THRESHOLD = 1 / 30;
const SETTLE_THRESHOLD = 0.004;

const clamp01 = value => Math.min(1, Math.max(0, value));

function smoothstep(start, end, value) {
  const progress = clamp01((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export default function ScrollScrubIntro({ onEntryReady, onHeroReadyChange }) {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const introRef = useRef(null);
  const tintRef = useRef(null);
  const endFadeRef = useRef(null);
  const heroReadyRef = useRef(false);
  const targetTimeRef = useRef(0);
  const durationRef = useRef(0);
  const progressRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const poster = new Image();
    let cancelled = false;
    const showLanding = () => {
      if (cancelled) return;
      window.clearTimeout(fallback);
      onEntryReady(true);
    };
    // Never leave the landing hidden if a browser stalls or rejects the image.
    const fallback = window.setTimeout(showLanding, 1800);
    poster.src = POSTER_SRC;
    if (poster.decode) poster.decode().then(showLanding, showLanding);
    else {
      poster.onload = showLanding;
      poster.onerror = showLanding;
      if (poster.complete) showLanding();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      poster.onload = null;
      poster.onerror = null;
    };
  }, [onEntryReady]);

  useLandingGsap(sectionRef, ({ ScrollTrigger, mobile, reduce }) => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return undefined;

    video.pause();
    if (reduce) return undefined;

    durationRef.current = 0;
    targetTimeRef.current = 0;
    progressRef.current = 0;
    let interpolatedTime = video.currentTime || 0;
    let lastFrameAt = 0;
    let lastSeekAt = -Infinity;
    let heroReady = heroReadyRef.current;
    const smoothing = mobile ? 0.16 : 0.12;
    const seekInterval = 1000 / (mobile ? 24 : 30);

    const scheduleFrame = () => {
      if (!rafRef.current) rafRef.current = window.requestAnimationFrame(render);
    };

    const render = now => {
      rafRef.current = 0;
      const duration = durationRef.current;
      const progress = progressRef.current;
      const targetTime = targetTimeRef.current;

      if (duration > 0) {
        // Normalize the easing to 60 fps so high-refresh displays feel the same.
        const elapsed = lastFrameAt ? Math.min(now - lastFrameAt, 64) : 1000 / 60;
        const easing = 1 - Math.pow(1 - smoothing, elapsed / (1000 / 60));
        interpolatedTime += (targetTime - interpolatedTime) * easing;
        if (Math.abs(targetTime - interpolatedTime) < SETTLE_THRESHOLD) interpolatedTime = targetTime;

        // Let the current frame decode before asking the browser for another seek.
        if (!video.seeking && now - lastSeekAt >= seekInterval && Math.abs(video.currentTime - interpolatedTime) >= SEEK_THRESHOLD) {
          try {
            video.currentTime = interpolatedTime;
            lastSeekAt = now;
          } catch {
            // Metadata can be invalidated while the browser reloads the media.
          }
        }
      }

      // Allow for subpixel ScrollTrigger rounding at the nominal 98% handoff.
      if (!heroReady && duration > 0 && progress >= 0.975 && interpolatedTime / duration >= 0.975) {
        heroReady = true;
        heroReadyRef.current = true;
        onHeroReadyChange(true);
      } else if (heroReady && progress <= 0.82) {
        heroReady = false;
        heroReadyRef.current = false;
        onHeroReadyChange(false);
      }

      const introOpacity = 1 - smoothstep(0.08, 0.15, progress);
      if (introRef.current) {
        introRef.current.style.opacity = String(introOpacity);
        introRef.current.style.transform = 'translate3d(0, ' + (-8 * (1 - introOpacity)) + 'px, 0)';
      }
      if (tintRef.current) tintRef.current.style.opacity = String(introOpacity);
      if (endFadeRef.current) {
        endFadeRef.current.style.opacity = String(smoothstep(0.9, 1, progress));
      }

      // Preserve elapsed time across decoding so a slow seek cannot add extra lag.
      if (video.seeking) {
        lastFrameAt = now;
      } else if (duration > 0 && (
        Math.abs(targetTime - interpolatedTime) >= SETTLE_THRESHOLD ||
        Math.abs(video.currentTime - targetTime) >= SEEK_THRESHOLD
      )) {
        lastFrameAt = now;
        scheduleFrame();
      } else {
        lastFrameAt = 0;
      }
    };

    const schedule = nextProgress => {
      progressRef.current = clamp01(nextProgress);
      // Keep the final decoded frame available instead of seeking past it.
      const duration = durationRef.current;
      targetTimeRef.current = duration > 0 ? Math.min(progressRef.current * duration, duration - 0.001) : 0;
      scheduleFrame();
    };

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: self => schedule(self.progress),
      onRefresh: self => schedule(self.progress),
    });

    const onMetadata = () => {
      durationRef.current = Number.isFinite(video.duration) ? video.duration : 0;
      interpolatedTime = video.currentTime || 0;
      schedule(trigger.progress);
    };
    const onSeeked = () => {
      if (Math.abs(targetTimeRef.current - interpolatedTime) >= SETTLE_THRESHOLD ||
          Math.abs(video.currentTime - targetTimeRef.current) >= SEEK_THRESHOLD) {
        scheduleFrame();
      }
    };

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('seeked', onSeeked);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata();
    else schedule(trigger.progress);

    return () => {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('seeked', onSeeked);
      trigger.kill();
      if (introRef.current) {
        introRef.current.style.opacity = '';
        introRef.current.style.transform = '';
      }
      if (tintRef.current) tintRef.current.style.opacity = '';
      if (endFadeRef.current) endFadeRef.current.style.opacity = '';
    };
  }, []);

  return (
    <section id="landing-intro" ref={sectionRef} className="landing-scroll-hero landing-section-dark isolate bg-sidebar text-foreground" aria-label="SEA-IT-SOLVED introduction">
      <div className="landing-scroll-hero-sticky">
        <div className="landing-scroll-hero-media" aria-hidden="true">
          <video
            ref={videoRef}
            poster={POSTER_SRC}
            preload="auto"
            muted
            playsInline
            disablePictureInPicture
            tabIndex={-1}
          >
            <source src={VIDEO_MOBILE_SRC} media="(max-width: 1023px)" type="video/mp4" />
            <source src={VIDEO_DESKTOP_SRC} type="video/mp4" />
          </video>
        </div>
        <div ref={tintRef} className="landing-scroll-hero-tint" aria-hidden="true" />
        <div ref={introRef} className="landing-scroll-hero-intro">
          <p className="landing-scroll-hero-eyebrow">Welcome to SEA-IT-SOLVED</p>
          <p className="landing-scroll-hero-prompt">Scroll to see how a lecture<br />becomes intelligent learning.</p>
          <span className="landing-scroll-hero-cue">Scroll to explore <ArrowDown size={14} aria-hidden="true" /></span>
        </div>
        <div ref={endFadeRef} className="landing-scroll-hero-end" aria-hidden="true" />
      </div>
    </section>
  );
}
