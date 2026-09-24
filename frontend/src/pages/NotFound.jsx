import { Component, lazy, Suspense, useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const ErrorScene3D = lazy(() => import('../components/not-found/ErrorScene3D'));

const FALLBACK_SYMBOLS = [
  { value: '∫', className: 'left-[11%] top-[15%]' },
  { value: 'Σ', className: 'right-[12%] top-[18%] [animation-delay:-3s]' },
  { value: 'π', className: 'bottom-[19%] left-[16%] [animation-delay:-8s]' },
  { value: '√', className: 'bottom-[17%] right-[15%] [animation-delay:-5s]' },
  { value: '∞', className: 'left-[46%] top-[9%] [animation-delay:-11s]' },
  { value: 'Δ', className: 'bottom-[8%] right-[30%] [animation-delay:-7s]' },
  { value: 'θ', className: 'left-[5%] top-[44%] [animation-delay:-2s]' },
  { value: 'f(x)', className: 'right-[5%] top-[39%] text-[clamp(1rem,2.5vw,1.6rem)] [animation-delay:-10s]' },
];

const BLOB_CLASS = 'absolute block aspect-square w-[clamp(24rem,52vw,52rem)] rounded-full opacity-[.38] blur-[clamp(82px,10vw,140px)] will-change-transform max-[479px]:blur-[clamp(68px,18vw,94px)] motion-reduce:animate-none motion-reduce:will-change-auto dark:opacity-[.24]';

class SceneErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function getHomePath(user) {
  if (user?.role === 'ADMIN') return '/admin';
  if (user?.role === 'INSTRUCTOR') return '/instructor';
  if (user?.role === 'STUDENT') return '/student';
  return '/';
}

export default function NotFound() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const [webglAvailable, setWebglAvailable] = useState(supportsWebGL);
  const [sceneReady, setSceneReady] = useState(false);
  const markSceneReady = useCallback(() => setSceneReady(true), []);
  const disableScene = useCallback(() => {
    setSceneReady(false);
    setWebglAvailable(false);
  }, []);
  const enter = (delay, y = 8, scale = 1) => ({
    initial: reducedMotion ? false : { opacity: 0, y, scale },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: reducedMotion ? { duration: 0 } : { duration: .34, delay, ease: [0.16, 1, 0.3, 1] },
  });

  return (
    <main className="not-found-page relative isolate grid min-h-screen min-h-dvh place-items-center overflow-hidden px-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-foreground landscape-compact:pb-[max(.75rem,env(safe-area-inset-bottom))] landscape-compact:pt-[max(.75rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 -z-[2] overflow-hidden" aria-hidden="true">
        <span className={`${BLOB_CLASS} -left-[17%] -top-[29%] animate-not-found-drift-one bg-[hsl(169_72%_52%/.88)] dark:bg-[hsl(174_71%_39%/.8)]`} />
        <span className={`${BLOB_CLASS} -bottom-[34%] -right-[18%] animate-not-found-drift-two bg-[hsl(187_74%_68%/.82)] dark:bg-[hsl(185_70%_36%/.72)]`} />
        <span className={`${BLOB_CLASS} right-[25%] top-[20%] w-[clamp(18rem,34vw,34rem)] animate-not-found-drift-three bg-[hsl(153_61%_64%/.74)] opacity-30 dark:bg-[hsl(151_62%_34%/.7)] dark:opacity-[.19]`} />
        <span className={`${BLOB_CLASS} -bottom-[20%] left-[19%] w-[clamp(19rem,37vw,37rem)] animate-not-found-drift-four bg-[hsl(38_77%_79%/.7)] opacity-30 dark:bg-[hsl(164_52%_23%/.62)] dark:opacity-[.16]`} />
      </div>
      <div className="not-found-grain" aria-hidden="true" />

      <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none ${sceneReady ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true">
        {FALLBACK_SYMBOLS.map(symbol => <span key={symbol.value} className={`absolute animate-not-found-fallback-float font-serif text-[clamp(1.4rem,4vw,2.7rem)] font-semibold text-primary opacity-[.22] motion-reduce:animate-none ${symbol.className}`}>{symbol.value}</span>)}
      </div>
      {webglAvailable && (
        <Suspense fallback={null}>
          <SceneErrorBoundary onFailure={disableScene}>
            <ErrorScene3D visible={sceneReady} theme={theme} reducedMotion={Boolean(reducedMotion)} onReady={markSceneReady} onFailure={disableScene} />
          </SceneErrorBoundary>
        </Suspense>
      )}

      <section className="pointer-events-none relative z-[2] flex w-full min-w-0 max-w-[42rem] flex-col items-center text-center" aria-labelledby="not-found-title">
        <motion.p {...enter(0, 0, .96)} className={`m-0 bg-gradient-to-br from-brand via-primary to-success bg-clip-text pr-[.085em] text-[clamp(7rem,21vw,14rem)] font-black leading-[.8] tracking-[-.085em] text-transparent [text-shadow:0_16px_52px_hsl(var(--primary)/.12)] transition-opacity duration-300 max-[479px]:text-[clamp(6.75rem,40vw,10rem)] motion-reduce:transition-none landscape-compact:text-[clamp(5rem,31vh,8rem)] ${sceneReady ? 'opacity-0 [text-shadow:none]' : ''}`} aria-label="Error 404">404</motion.p>
        <motion.h1 {...enter(.1)} id="not-found-title" className="mt-[clamp(2.15rem,5vw,3.15rem)] text-[clamp(1.75rem,4vw,2.6rem)] font-extrabold leading-[1.08] tracking-[-.035em] max-[479px]:mt-[1.7rem] landscape-compact:mt-3 landscape-compact:text-2xl">Page not found</motion.h1>
        <motion.p {...enter(.18)} className="mt-[.85rem] max-w-[34rem] text-[clamp(.94rem,2vw,1.05rem)] leading-[1.7] text-muted-foreground landscape-compact:mt-[.4rem] landscape-compact:text-[.85rem] landscape-compact:leading-[1.45]">The page you&apos;re looking for doesn&apos;t exist or may have been moved.</motion.p>
        <motion.div {...enter(.26)} className="pointer-events-auto mt-[1.6rem] landscape-compact:mt-[.85rem]">
          <Link className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-[1.1rem] py-[.7rem] text-sm font-bold text-primary-foreground shadow-[0_10px_26px_hsl(var(--primary)/.16)] transition-[transform,background-color,border-color,box-shadow] hover:-translate-y-px hover:border-primary-hover hover:bg-primary-hover hover:shadow-[0_12px_30px_hsl(var(--primary)/.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ring max-[479px]:w-[min(100%,18rem)] motion-reduce:transition-none landscape-compact:min-h-10 landscape-compact:py-2" to={getHomePath(user)}>
            <ArrowLeft size={17} aria-hidden="true" className="transition-transform duration-150 group-hover:-translate-x-[3px] motion-reduce:transition-none" />
            Go back home
          </Link>
        </motion.div>
        <motion.div {...enter(.32, 5)} className="mt-[clamp(2rem,7vh,3.5rem)] opacity-70 landscape-compact:mt-[.85rem]">
          <BrandLogo size="sm" compact />
        </motion.div>
      </section>
    </main>
  );
}
