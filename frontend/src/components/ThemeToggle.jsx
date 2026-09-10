import { useTheme } from '../context/ThemeContext';
import { Moon, Sun } from './icons';

export default function ThemeToggle({ compact = false, className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <button type="button" onClick={toggleTheme}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className={`group inline-flex touch-manipulation items-center ${compact ? 'w-11 justify-center' : 'w-full justify-between'} h-11 rounded-lg border border-border bg-card px-3 text-muted-foreground shadow-sm transition-[background-color,border-color,color,transform] duration-150 hover:border-primary/35 hover:bg-primary-subtle hover:text-primary-subtle-foreground active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}>
      {!compact && <span className="text-xs font-semibold">{dark ? 'Light mode' : 'Dark mode'}</span>}
      <span className="relative grid h-6 w-6 place-items-center overflow-hidden rounded-md bg-primary-subtle text-primary-subtle-foreground transition-transform duration-150 group-hover:rotate-6">
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </span>
    </button>
  );
}
