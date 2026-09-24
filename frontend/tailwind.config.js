/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        'input-surface': 'hsl(var(--input-surface))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          subtle: 'hsl(var(--primary-subtle))',
          'subtle-foreground': 'hsl(var(--primary-subtle-foreground))',
        },

        surface: {
          DEFAULT: 'hsl(var(--surface))',
          subtle: 'hsl(var(--surface-subtle))',
          elevated: 'hsl(var(--surface-elevated))',
        },

        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
        },

        brand: {
          DEFAULT: 'hsl(var(--brand))',
          foreground: 'hsl(var(--brand-foreground))',
        },

        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          subtle: 'hsl(var(--success-subtle))',
          'subtle-foreground': 'hsl(var(--success-subtle-foreground))',
        },

        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          subtle: 'hsl(var(--warning-subtle))',
          'subtle-foreground': 'hsl(var(--warning-subtle-foreground))',
        },

        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          subtle: 'hsl(var(--info-subtle))',
          'subtle-foreground': 'hsl(var(--info-subtle-foreground))',
        },

        ai: {
          DEFAULT: 'hsl(var(--ai))',
          foreground: 'hsl(var(--ai-foreground))',
          subtle: 'hsl(var(--ai-subtle))',
        },

        disabled: {
          DEFAULT: 'hsl(var(--disabled))',
          foreground: 'hsl(var(--disabled-foreground))',
        },

        skeleton: {
          DEFAULT: 'hsl(var(--skeleton))',
          highlight: 'hsl(var(--skeleton-highlight))',
        },

        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },

        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          subtle: 'hsl(var(--destructive-subtle))',
          'subtle-foreground': 'hsl(var(--destructive-subtle-foreground))',
        },

        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },

        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },

        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        glass: '0 6px 20px -16px rgb(15 23 42 / 0.3)',
        surface: '0 1px 2px rgb(15 23 42 / 0.04), 0 10px 30px -28px rgb(15 23 42 / 0.28)',
      },
      keyframes: {
        'notice-in': {
          from: { opacity: '0', transform: 'translate3d(0,-5px,0) scale(.99)' },
          to: { opacity: '1', transform: 'none' },
        },
        'notice-out': {
          from: { opacity: '1', transform: 'none' },
          to: { opacity: '0', transform: 'translate3d(0,-4px,0) scale(.99)' },
        },
        'not-found-drift-one': {
          '0%, 100%': { transform: 'translate3d(-4%, -3%, 0) scale(1)' },
          '50%': { transform: 'translate3d(18%, 14%, 0) scale(1.1)' },
        },
        'not-found-drift-two': {
          '0%, 100%': { transform: 'translate3d(4%, 5%, 0) scale(1.05)' },
          '50%': { transform: 'translate3d(-17%, -13%, 0) scale(.94)' },
        },
        'not-found-drift-three': {
          '0%, 100%': { transform: 'translate3d(0, -7%, 0) scale(.95)' },
          '50%': { transform: 'translate3d(-18%, 15%, 0) scale(1.12)' },
        },
        'not-found-drift-four': {
          '0%, 100%': { transform: 'translate3d(-5%, 3%, 0) scale(1.02) rotate(-2deg)' },
          '50%': { transform: 'translate3d(16%, -14%, 0) scale(.93) rotate(4deg)' },
        },
        'not-found-fallback-float': {
          '0%, 100%': { transform: 'translate3d(0, -5px, 0) rotate(-2deg)' },
          '50%': { transform: 'translate3d(7px, 9px, 0) rotate(3deg)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.3' },
        },
      },
      animation: {
        'notice-in': 'notice-in 240ms cubic-bezier(.2,.8,.2,1) both',
        'notice-out': 'notice-out 170ms ease-in both',
        'not-found-drift-one': 'not-found-drift-one 23s ease-in-out infinite',
        'not-found-drift-two': 'not-found-drift-two 27s ease-in-out infinite',
        'not-found-drift-three': 'not-found-drift-three 19s ease-in-out infinite',
        'not-found-drift-four': 'not-found-drift-four 29s ease-in-out infinite',
        'not-found-fallback-float': 'not-found-fallback-float 14s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.5s infinite',
      },
    },
  },
  plugins: [
    ({ addVariant }) => {
      addVariant('landscape-compact', '@media (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
    },
  ],
};
