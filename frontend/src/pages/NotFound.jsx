import { Component, lazy, Suspense, useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const ErrorScene3D = lazy(() => import('../components/not-found/ErrorScene3D'));

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
    <main className={`not-found-page ${sceneReady ? 'has-webgl-scene' : 'uses-css-fallback'}`}>
      <div className="not-found-ambient" aria-hidden="true">
        <span className="not-found-blob not-found-blob-one" />
        <span className="not-found-blob not-found-blob-two" />
        <span className="not-found-blob not-found-blob-three" />
        <span className="not-found-blob not-found-blob-four" />
      </div>
      <div className="not-found-grain" aria-hidden="true" />

      <div className="not-found-fallback-symbols" aria-hidden="true">
        {['∫', 'Σ', 'π', '√', '∞', 'Δ', 'θ', 'f(x)'].map(symbol => <span key={symbol}>{symbol}</span>)}
      </div>
      {webglAvailable && (
        <Suspense fallback={null}>
          <SceneErrorBoundary onFailure={disableScene}>
            <ErrorScene3D theme={theme} reducedMotion={Boolean(reducedMotion)} onReady={markSceneReady} onFailure={disableScene} />
          </SceneErrorBoundary>
        </Suspense>
      )}

      <section className="not-found-content" aria-labelledby="not-found-title">
        <motion.p {...enter(0, 0, .96)} className={`not-found-code ${sceneReady ? 'is-scene-ready' : ''}`} aria-label="Error 404">404</motion.p>
        <motion.h1 {...enter(.1)} id="not-found-title">Page not found</motion.h1>
        <motion.p {...enter(.18)} className="not-found-message">The page you&apos;re looking for doesn&apos;t exist or may have been moved.</motion.p>
        <motion.div {...enter(.26)} className="not-found-action-wrap">
          <Link className="not-found-home-action" to={getHomePath(user)}>
            <ArrowLeft size={17} aria-hidden="true" />
            Go back home
          </Link>
        </motion.div>
        <motion.div {...enter(.32, 5)} className="not-found-brand">
          <BrandLogo size="sm" compact />
        </motion.div>
      </section>
    </main>
  );
}
