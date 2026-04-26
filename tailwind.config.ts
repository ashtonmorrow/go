import type { Config } from 'tailwindcss';

// === Design system tokens ===
// One source of truth for colours / fonts / sizes used across the entire
// app. When a component needs a value not in this list, the answer is
// usually "add it here, then use it" — not "inline a hex".
//
// === Colour role table ====================================================
// Following the 60 / 30 / 10 split: 60% surfaces, 30% text/structure, 10% accent.
//
// SURFACES (60%) — backgrounds and chrome
//   white            chrome (sidebar, popovers, headers)
//   cream-soft       content cards, hover states, table headers
//   cream            very-soft warm surface (used sparingly — reads gold)
//   paper            postcard paper (warm, slightly aged feel)
//   sand             borders, dividers
//   paper-edge       paper-card borders
//
// TEXT + STRUCTURE (30%)
//   ink-deep         primary text, headlines, ACTIVE chrome state (selected
//                    chip, pinned button, etc). Tuned to a near-neutral
//                    dark so toggles don't read as 'blue'.
//   ink              body text
//   slate            secondary text, labels, "Go" status
//   muted            tertiary text, captions, section labels
//
// ACCENT (10%) — used sparingly
//   teal             BRAND ACCENT. Status: 'Been'. Hover-emphasis on links.
//                    Used for postcard postmark (VISITED) and map pins.
//   accent (amber)   NARROW USE: sister-city relationship visualisation on
//                    the map only. Don't sprinkle it elsewhere.
//   slate            STATUS: 'Go' / planned. (Doubles as text role above.)
//
// ACTIVE CHROME STATE — every selected chip / pinned button uses
//   bg-ink-deep + text-cream-soft. NO exceptions; if a control needs a
//   different active treatment, that's a sign it should not be a chip.
// =========================================================================
//
// Type scale: display (60) → h1 (40) → h2 (28) → h3 (20) → body (16) → small (13)
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#2e2e2e',
        // Near-black with a faint warm undertone so it sits with the cream
        // / paper / sand surfaces. Was #0f172a (navy) which read as 'blue'
        // on every selected toggle and pinned button.
        'ink-deep': '#1c1b19',
        slate: '#6b7c8f',
        muted: '#7c7e7f',
        cream: '#f6f1e8',
        'cream-soft': '#faf9f7',
        sand: '#eceae6',
        // The warm paper colour used for the postcards. Slightly cooler-warm
        // than cream; gives the "aged stationery" feel.
        paper: '#fdfaf2',
        'paper-edge': 'hsl(35 25% 78%)',
        sky: '#afc7d6',
        teal: '#2f6f73',
        // Amber accent — sister-city highlight on the map only. Narrow scope.
        accent: '#b8862e',
      },
      fontFamily: {
        // Inter loaded via @import in globals.css. System fallbacks ensure
        // the page is usable before the webfont arrives.
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // Tabular monospace for stats / coords / "typed-on-postcard" feel.
        // Using ui-monospace so each platform picks its native mono (SF Mono
        // on macOS, Segoe UI Mono on Windows, etc.).
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
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
      // Single, named shadow scale used app-wide. Components reaching for
      // a custom shadow should pick the closest one here, or extend.
      boxShadow: {
        // Soft warm shadow under postcards / paper surfaces
        paper:
          '0 1px 2px rgba(80, 56, 28, 0.06), 0 4px 8px rgba(80, 56, 28, 0.07), 0 12px 18px -6px rgba(80, 56, 28, 0.08)',
        // Cool-grey shadow for chrome cards (sidebars, popovers)
        card:
          '0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 8px rgba(15, 23, 42, 0.05), 0 12px 18px -6px rgba(15, 23, 42, 0.06)',
        // Pill / button — the layered shadow used on the nav pills
        pill:
          '0 0.6px 0.6px -1.25px rgba(0,0,0,0.18), 0 2.29px 2.29px -2.5px rgba(0,0,0,0.16), 0 10px 10px -3.75px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
