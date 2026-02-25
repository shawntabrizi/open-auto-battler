/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        title: ['"Cinzel Decorative"', 'serif'],
        heading: ['Cinzel', 'serif'],
        stat: ['Teko', 'sans-serif'],
      },
      colors: {
        'mana-blue': '#4a90d9',
        'pitch-red': '#d94a4a',
        gold: '#ffd700',
        'card-bg': '#2a2a3a',
        'board-bg': '#1a1a2a',
        'shop-bg': '#252535',
        'surface-dark': '#0d0d1a',
        'surface-mid': '#151528',
        'accent-amber': '#f59e0b',
        'accent-emerald': '#10b981',
        'accent-violet': '#8b5cf6',
        'victory-green': '#16a34a',
        'defeat-red': '#dc2626',
      },
      keyframes: {
        'idle-wobble': {
          '0%, 100%': { transform: 'rotate(-1deg)' },
          '50%': { transform: 'rotate(1deg)' },
        },
        'card-entrance': {
          '0%': { opacity: '0', transform: 'translateY(30px) scale(0.8)' },
          '60%': { opacity: '1', transform: 'translateY(-4px) scale(1.03)' },
          '100%': { transform: 'translateY(0) scale(1)' },
        },
        'scale-bounce': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.25)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        'death-shrink': {
          '0%': { opacity: '1', transform: 'scale(1)', filter: 'brightness(1)' },
          '20%': { filter: 'brightness(3) saturate(0)' },
          '60%': { opacity: '0.5', transform: 'scale(0.6)', filter: 'brightness(1)' },
          '100%': { opacity: '0', transform: 'scale(0.3)' },
        },
        'phase-splash': {
          '0%': { opacity: '0', transform: 'scale(3)' },
          '20%': { opacity: '1', transform: 'scale(1)' },
          '70%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.9)' },
        },
        'screen-shake': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-4px, 2px)' },
          '20%': { transform: 'translate(4px, -2px)' },
          '30%': { transform: 'translate(-3px, -1px)' },
          '40%': { transform: 'translate(3px, 1px)' },
          '50%': { transform: 'translate(-2px, 2px)' },
          '60%': { transform: 'translate(2px, -1px)' },
          '70%': { transform: 'translate(-1px, 1px)' },
          '80%': { transform: 'translate(1px, -1px)' },
          '90%': { transform: 'translate(-1px, 0)' },
        },
        'ability-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(255, 215, 0, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(255, 215, 0, 0.8)' },
        },
        'number-pop': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1.3)' },
          '30%': { opacity: '1', transform: 'translateY(-10px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-40px) scale(0.8)' },
        },
        'stagger-fade-in': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'color-flash': {
          '0%': { opacity: '0.4' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'idle-wobble': 'idle-wobble 2.5s ease-in-out infinite',
        'card-entrance': 'card-entrance 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'scale-bounce': 'scale-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'death-shrink': 'death-shrink 0.6s ease-out forwards',
        'phase-splash': 'phase-splash 1.5s ease-out forwards',
        'screen-shake': 'screen-shake 0.25s ease-out',
        'ability-glow': 'ability-glow 1s ease-in-out infinite',
        'number-pop': 'number-pop 0.8s ease-out forwards',
        'stagger-fade-in': 'stagger-fade-in 0.5s ease-out forwards',
        'color-flash': 'color-flash 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};
