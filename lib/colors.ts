// Brand colour constants — JS mirror of the Tailwind theme tokens in
// tailwind.config.ts. Use these whenever a colour value has to be a raw
// string (MapLibre paint expressions, inline SVG fill, etc.) so the design
// system stays unified.
//
// IF YOU UPDATE A VALUE HERE, also update tailwind.config.ts.
export const COLORS = {
  ink: '#2e2e2e',
  inkDeep: '#0f172a',
  slate: '#6b7c8f',
  muted: '#7c7e7f',
  white: '#ffffff',
  cream: '#f6f1e8',
  creamSoft: '#faf9f7',
  sand: '#eceae6',
  paper: '#fdfaf2',
  paperEdge: 'hsl(35 25% 78%)',
  sky: '#afc7d6',
  teal: '#2f6f73',
  // Amber accent — sister-city highlight on the map, secondary accents.
  accent: '#b8862e',
  // Quiet sand-grey used for de-emphasised pins (sister-city placeholders).
  pinIdle: '#c8c4ba',
} as const;
