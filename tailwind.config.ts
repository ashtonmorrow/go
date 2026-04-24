import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#2e2e2e',
        'ink-deep': '#0f172a',
        slate: '#6b7c8f',
        muted: '#7c7e7f',
        cream: '#f6f1e8',
        'cream-soft': '#faf9f7',
        sand: '#eceae6',
        sky: '#afc7d6',
        teal: '#2f6f73',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      maxWidth: {
        prose: '810px',
        page: '1200px',
      },
      borderRadius: {
        DEFAULT: '10px',
      },
      fontSize: {
        display: ['60px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['40px', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        h2: ['28px', { lineHeight: '1.2', letterSpacing: '-0.005em', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '1.3', fontWeight: '500' }],
        body: ['16px', { lineHeight: '1.6' }],
        small: ['13px', { lineHeight: '1.5' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
