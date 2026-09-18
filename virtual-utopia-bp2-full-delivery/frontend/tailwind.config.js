/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--c-surface-muted) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--c-accent-strong) / <alpha-value>)',
      },
      borderRadius: {
        hig: '0.875rem',
        'hig-lg': '1.25rem',
      },
      boxShadow: {
        hig: '0 8px 30px rgba(40, 48, 43, 0.07)',
        'hig-soft': '0 2px 12px rgba(40, 48, 43, 0.05)',
      },
      transitionDuration: {
        hig: '180ms',
      },
    },
  },
  plugins: [],
};
