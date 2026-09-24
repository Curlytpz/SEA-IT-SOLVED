import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'sea-it-solved-theme';
const THEME_TRANSITION_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

function applyDocumentTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  localStorage.setItem(STORAGE_KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#121A17' : '#F5F3EC');
}

function initialTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const activeTransitionRef = useRef(null);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const nextTheme = root.classList.contains('dark') ? 'light' : 'dark';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const commit = () => {
      applyDocumentTheme(nextTheme);
      flushSync(() => setTheme(nextTheme));
    };

    if (!document.startViewTransition || reduceMotion) {
      commit();
      return;
    }

    activeTransitionRef.current?.skipTransition?.();
    root.dataset.themeTransition = nextTheme;
    let transition;
    try {
      transition = document.startViewTransition(commit);
    } catch {
      delete root.dataset.themeTransition;
      commit();
      return;
    }
    activeTransitionRef.current = transition;

    transition.ready.then(() => {
      const origin = nextTheme === 'dark' ? '0% 0%' : '100% 100%';
      const radius = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight));
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      root.animate({
        clipPath: [`circle(0px at ${origin})`, `circle(${radius}px at ${origin})`],
        opacity: [0.985, 1],
        filter: ['blur(0.65px)', 'blur(0px)'],
      }, {
        duration: mobile ? 500 : 610,
        easing: THEME_TRANSITION_EASING,
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      });
    }).catch(() => {});

    const finishTransition = () => {
      if (activeTransitionRef.current === transition) activeTransitionRef.current = null;
      if (root.dataset.themeTransition === nextTheme) delete root.dataset.themeTransition;
    };
    transition.finished.then(finishTransition, finishTransition);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
