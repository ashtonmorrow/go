'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCityFilters } from './CityFiltersContext';
import { COLORS } from '@/lib/colors';
import type { City } from '@/lib/cityShape';
import { useFilteredCities } from '@/lib/useFilteredCities';
import ActiveFilters from './ActiveFilters';
import KoppenIcon from './KoppenIcon';

type Props = { cities: City[] };

const PAGE_SIZE = 36;

export default function CitiesGrid({ cities }: Props) {
  const router = useRouter();
  const filters = useCityFilters();
  const state = filters?.state;

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Shared filter logic — same hook the /table view uses, so flipping
  // between the two shows identical results in identical order.
  const filtered = useFilteredCities(cities);

  // Reset pagination whenever filters change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [state]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setVisibleCount(v => Math.min(v + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: '600px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  return (
    <section className="max-w-page mx-auto px-5 py-6">
      {/* The "Cities" heading + intro prose moved to the dedicated /about
          technical article. The postcard grid is now the entire main view;
          chrome lives in the sidebar (filters, navigation). */}

      {/* Active-filter breadcrumb ribbon — only renders when at least one
          narrowing facet is active. Mounts above the postcard grid so the
          state is visible without scrolling. */}
      <ActiveFilters className="mb-3" />

      {/* Postcard grid: landscape cards, 3 columns max so each card has room
          for the stamp + two-column body without text truncating. */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map(c => (
          <CityCard key={c.id} city={c} onClick={() => router.push(`/cities/${c.slug}`)} />
        ))}
      </div>

      {remaining > 0 && (
        <div ref={sentinel} className="mt-8 text-center text-small text-muted py-8">
          Loading more… ({remaining} left)
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">
          <p>No cities match.</p>
        </div>
      )}

      {/* View switcher now lives at the page level (app/cities/cards/page.tsx)
          alongside the H1; no floating duplicate here. */}
    </section>
  );
}

// (Page-level Toggle and Segmented helpers were moved to FilterPanel where
//  they live as Switch / Select / DirectionButton tied to the sidebar
//  cockpit. Removing them from here keeps this file focused on the
//  postcard rendering.)

function Postmark({ label, subtitle, color }: { label: string; subtitle: string; color: string }) {
  // Hand-stamped postal cancellation mark, semi-transparent, slightly rotated,
  // overlapping the postage stamp the way real postmarks do.
  // Shape: outer ring + inner ring, horizontal cancellation bar through middle,
  // top arc text with the label and bottom arc with the subtitle.
  const id = `pm-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        // Overlaps the upper-left corner of the (now landscape) postage
        // stamp, like a real postal cancellation hitting the stamp face.
        // Stamp is at top-1.5 right-2 with width 90, so its left edge
        // sits ~98px from the card's right edge. Postmark is 56px wide
        // and right-anchored at ~62 so its right ~third overlaps the
        // upper-left of the stamp.
        top: -2,
        right: 62,
        width: 56,
        height: 56,
        transform: 'rotate(-14deg)',
        opacity: 0.78,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width="60" height="60">
        <defs>
          <path id={`${id}-top`} d="M 8 32 a 24 24 0 0 1 48 0" fill="none" />
          <path id={`${id}-bot`} d="M 8 32 a 24 24 0 0 0 48 0" fill="none" />
        </defs>
        {/* Outer & inner concentric rings */}
        <circle cx="32" cy="32" r="29" fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx="32" cy="32" r="22" fill="none" stroke={color} strokeWidth="0.8" />
        {/* Cancellation bar */}
        <line x1="2" y1="32" x2="62" y2="32" stroke={color} strokeWidth="2" />
        {/* Top arc text — the main label */}
        <text fontSize="6.5" fontWeight="700" fill={color} letterSpacing="1.2">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            {label}
          </textPath>
        </text>
        {/* Bottom arc text — country/subtitle */}
        <text fontSize="4" fontWeight="500" fill={color} letterSpacing="0.4">
          <textPath href={`#${id}-bot`} startOffset="50%" textAnchor="middle">
            {(subtitle || '').slice(0, 18).toUpperCase()}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

function fmtCoord(value: number | null, axis: 'lat' | 'lng'): string {
  if (value == null) return '—';
  const dir = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(2)}°${dir}`;
}

function fmtPopulation(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Intl.NumberFormat('en').format(n);
}

function CityCard({ city, onClick }: { city: City; onClick: () => void }) {
  const flagSrc = city.cityFlag || city.countryFlag;
  // Postcard flips on hover IF we have coordinates (so we can render a map back).
  const hasLocation = city.lat != null && city.lng != null;
  // (Previously: dotX/dotY for an inline postmark mini-map. Removed in the
  //  typography redesign — the back-of-card map already shows location.)

  // Tiny deterministic rotation per card so the grid feels like a wall of
  // hand-placed postcards, not a uniform layout. Hash the id to a stable
  // angle in roughly [-1.2°, +1.2°].
  const seed = (city.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const tilt = ((seed % 25) - 12) / 10; // -1.2..1.2 deg

  // === Back-of-postcard map ===
  // Earlier this used a single OSM tile + background-position to "pan" to the
  // city. That math is wrong with `background-size: cover` on a non-square
  // card: cover scales the tile to fill the card and on the wider axis there's
  // no slack to pan, so the city ends up offset from where the pin is drawn
  // (50%/50%). Fix: render a 3x3 grid of tiles centred on the city's tile,
  // then translate that grid so the city's exact pixel sits dead-centre under
  // the pin. With 9 tiles around the city we always have enough map to fill
  // the card no matter where the city falls within its tile.
  const ZOOM = 4;
  const TILE_SIZE = 256;
  type Tile = { dx: number; dy: number; url: string | null };
  let tiles: Tile[] = [];
  let cityPxX = 0;
  let cityPxY = 0;
  if (hasLocation) {
    const n = Math.pow(2, ZOOM);
    const xf = ((city.lng! + 180) / 360) * n;
    const yf = ((1 - Math.asinh(Math.tan((city.lat! * Math.PI) / 180)) / Math.PI) / 2) * n;
    const cityTileX = Math.floor(xf);
    const cityTileY = Math.floor(yf);
    cityPxX = (xf - cityTileX) * TILE_SIZE; // 0..256, city's x within centre tile
    cityPxY = (yf - cityTileY) * TILE_SIZE;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = cityTileX + dx;
        const ty = cityTileY + dy;
        // Wrap longitude (the world is a cylinder); clamp out-of-range Y near the poles
        const wx = ((tx % n) + n) % n;
        const url = ty < 0 || ty >= n ? null : `https://tile.openstreetmap.org/${ZOOM}/${wx}/${ty}.png`;
        tiles.push({ dx, dy, url });
      }
    }
  }
  // City's pixel within the 3x3 grid (768x768): centre tile starts at (TILE_SIZE, TILE_SIZE).
  const gridCityX = TILE_SIZE + cityPxX; // ∈ [256, 512]
  const gridCityY = TILE_SIZE + cityPxY;

  // Outer wrapper: provides perspective + size + click handler
  return (
    <div
      onClick={onClick}
      className={'flip-perspective cursor-pointer group ' + (hasLocation ? '' : 'no-flip')}
      style={{ aspectRatio: '5 / 3', transform: `rotate(${tilt}deg)` }}
    >
      <div className={'flip-card ' + (hasLocation ? '' : '!transform-none')}>
        {/* === BACK FACE === a country/region map with the city marked === */}
        {hasLocation && tiles.length > 0 && (
          <div
            className="flip-face flip-face-back overflow-hidden bg-cream-soft border border-paper-edge rounded-[4px] shadow-card"
          >
            {/* 3x3 tile grid, anchored so the city's exact pixel sits at
                card centre (50% / 50%). The translate negates gridCity to
                shift the grid up-and-left, then `left:50%;top:50%` puts that
                negated point at the card centre — net effect: gridCity is at
                card centre. The pin is drawn at card centre below. */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: TILE_SIZE * 3,
                height: TILE_SIZE * 3,
                transform: `translate(${-gridCityX}px, ${-gridCityY}px)`,
                pointerEvents: 'none',
              }}
            >
              {tiles.map(t =>
                t.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${t.dx}_${t.dy}`}
                    src={t.url}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: (t.dx + 1) * TILE_SIZE,
                      top: (t.dy + 1) * TILE_SIZE,
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      display: 'block',
                    }}
                    loading="lazy"
                    draggable={false}
                  />
                ) : null
              )}
            </div>

            {/* City pin always at container centre (since the tile grid is
                anchored so the city's pixel lands here). */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: COLORS.teal,
                  border: '2px solid white',
                  boxShadow: '0 0 0 6px rgba(47, 111, 115, 0.22)',
                }}
              />
            </div>

            {/* OSM attribution (required by their tile policy) */}
            <div
              className="absolute top-1 right-1 text-[8px] bg-white/85 text-ink-deep/70 px-1 rounded leading-none py-0.5"
              style={{ pointerEvents: 'none' }}
            >
              © OpenStreetMap
            </div>

            {/* Bottom strip: city name + "View my Pins" button (if savedPlaces) */}
            <div
              className="absolute bottom-0 inset-x-0 px-3 py-2 z-10 flex items-center justify-between gap-3"
              style={{
                background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.7))',
              }}
            >
              <div className="text-white text-[11px] uppercase tracking-[0.18em] font-medium truncate">
                {city.name}
              </div>
              {city.savedPlaces && (
                <a
                  href={city.savedPlaces}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-ink-deep text-[11px] font-medium hover:bg-cream-soft transition-colors flex-shrink-0 border-b border-ink-deep shadow-pill rounded-none"
                >
                  View my Pins <span aria-hidden>📍</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* === FRONT FACE (the postcard back side — address+stamp) ===
            Uses design-system tokens: bg-paper (the warm card colour),
            border-paper-edge, shadow-paper. The inner inset 5px ring fakes a
            printed frame just inside the edge — kept inline because it has
            to stack with the drop shadow.

            Layout: flex column. Header sits at top in natural flow; body
            (the dl of stat rows) takes the remaining space with flex-1.
            We previously absolute-positioned the body at top-[40%] which
            broke when new rows (Water, Electric) were added in the rebuild
            — at narrow card widths the last row clipped past the bottom. */}
        <div
      className="flip-face postcard relative transition-shadow bg-paper rounded-[4px] border border-paper-edge flex flex-col"
      style={{
        boxShadow:
          // Drop shadow (warm, like real paper)
          '0 1px 2px rgba(80, 56, 28, 0.06), 0 4px 8px rgba(80, 56, 28, 0.07), 0 12px 18px -6px rgba(80, 56, 28, 0.08),' +
          // Inset frame
          ' inset 0 0 0 1px rgba(255, 255, 255, 0.5), inset 0 0 0 5px hsl(35 25% 86%)',
      }}
    >
      {/* === STAMP — top-right ===
          LANDSCAPE 3:2 to match the natural aspect ratio of national flags.
          A portrait stamp left big white margins above and below the flag,
          which read as 'flag floating in a box' rather than as a stamp.
          Inner padding reduced to 6px so the flag fills the stamp face. */}
      <div
        className="stamp-perforated absolute top-1.5 right-2 z-10 w-[90px] h-[60px] bg-white p-1.5 flex items-center justify-center"
        style={{
          transform: 'rotate(2deg)',
          boxShadow: '0 1px 1px rgba(80, 56, 28, 0.08)',
        }}
        title={city.cityFlag ? `${city.name} flag` : city.country ? `${city.country} flag` : ''}
      >
        {flagSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagSrc} alt="" className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-sand" />
        )}
      </div>

      {/* === POSTMARK CANCELLATION STAMP ===
          Round inked stamp overlapping the postage stamp (like a real cancellation).
          "VISITED" for Been, "PLANNING" for Go-only. Pulled up to follow
          the stamp's new top-1 position. */}
      {(city.been || city.go) && (
        <Postmark
          label={city.been ? 'VISITED' : 'PLANNING'}
          subtitle={city.country || ''}
          color={city.been ? COLORS.teal : COLORS.slate}
        />
      )}

      {/*  ──────────────────────────────────────────────────────────────
            POSTCARD TYPOGRAPHY — three-tier type scale, two type families.
            Following standard postcard design rules:
              • One bold display headline (city) is the focal point
              • Sans-serif label tier (country, stat labels)
              • Monospace body tier (values) gives the typewriter-on-postcard
                feel that ties the whole card together
            Sizes are deliberately limited to avoid the previous "haphazard"
            mix of 8px / 9px / 10px / 11px / 14px / 15px.
          ──────────────────────────────────────────────────────────────  */}

      {/* === HEADER — coords pre-header, then city name + country.
          paddingRight clears the landscape stamp + a little breathing room.
          Coords moved up from the footer so the postcard reads top-down
          like a real postcard return-address: location → place → details. */}
      <div className="px-4 pt-3" style={{ paddingRight: 110 }}>
        {(city.lat != null || city.lng != null) && (
          <p className="text-[9px] font-mono text-muted tracking-[0.08em] mb-1 truncate">
            <span>{fmtCoord(city.lat, 'lat')}</span>
            <span aria-hidden className="opacity-40 mx-1">·</span>
            <span>{fmtCoord(city.lng, 'lng')}</span>
          </p>
        )}
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-ink-deep font-bold text-xl uppercase tracking-tight leading-none truncate">
            {city.name}
          </h3>
          {city.savedPlaces && (
            <a
              href={city.savedPlaces}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label={`Open ${city.name} in Google Maps`}
              title="Open my saved places in Google Maps"
              className="text-[15px] leading-none flex-shrink-0 hover:scale-110 transition-transform"
            >
              <span aria-hidden>📍</span>
            </a>
          )}
        </div>
        <p className="text-[10px] text-slate uppercase tracking-[0.18em] mt-1 truncate">
          {city.country}
        </p>
        {/* Letterhead-style rule under the headline. Subtle warm sand colour
            so it reads as a printed line on the card, not a UI divider. */}
        <div className="h-px bg-sand mt-2" />
      </div>

      {/* === BODY — single-column address-style stat list ===
          Label on the left (sans, small caps), value on the right (mono).
          Values are right-aligned so the column reads like a typewritten
          receipt. flex-1 + min-h-0 makes it consume whatever vertical space
          is left under the header, no matter how tall the card is in the
          current grid breakpoint. justify-around distributes the rows
          evenly so the column "breathes" on a tall card and packs in on
          a short one. */}
      <div className="px-4 pt-2 pb-2.5 flex-1 min-h-0 flex flex-col justify-around">
        <dl className="text-[11px] leading-tight">
          {fmtPopulation(city.population) && (
            <Row label="Population" value={fmtPopulation(city.population)!} />
          )}
          {(city.avgHigh != null || city.avgLow != null) && (
            <Row
              label="Avg Temp"
              value={
                (city.avgLow != null ? city.avgLow.toFixed(0) : '?') +
                '–' +
                (city.avgHigh != null ? city.avgHigh.toFixed(0) : '?') +
                '°C'
              }
            />
          )}
          {/* Currency — glyph + ISO code together, separated by a slim
              divider. Glyph alone is hard to map ("$" could be USD, AUD,
              CAD, MXN, ARS); code alone reads as a 3-letter abbreviation
              with no visual anchor. Together they're recognisable both
              ways. Falls back to code-only when the glyph is unknown. */}
          {city.currency && (
            <div className="flex justify-between items-baseline gap-3 py-px">
              <dt className="text-[9px] text-muted uppercase tracking-[0.14em] font-medium flex-shrink-0">
                Currency
              </dt>
              <dd className="text-ink-deep font-mono text-[11px] truncate text-right">
                {city.currencySymbol && city.currencySymbol !== city.currency && (
                  <>
                    <span>{city.currencySymbol}</span>
                    <span aria-hidden className="text-muted mx-1">|</span>
                  </>
                )}
                <span>{city.currency}</span>
              </dd>
            </div>
          )}
          {city.language && <Row label="Language" value={city.language} />}
          {city.driveSide && (
            // Drive — pictorial. Tiny SVG of a stylised road with a 🚗
            // glyph positioned on the correct side. Plus the L/R letter
            // for accessibility / scanability.
            <div className="flex justify-between items-center gap-3 py-px">
              <dt className="text-[9px] text-muted uppercase tracking-[0.14em] font-medium flex-shrink-0">
                Drive
              </dt>
              <dd className="text-ink-deep flex items-center gap-1.5">
                <span className="font-mono text-[11px]">{city.driveSide}</span>
                <DriveIcon side={city.driveSide} />
              </dd>
            </div>
          )}
          {/* Water — tap-water safety. Drop emoji + label is more
              glanceable than the four-state text. */}
          {city.tapWater && <Row label="Water" value={fmtTapWater(city.tapWater)} />}
          {/* Electric — plug type letters + voltage. Travelers obsess
              over this; the plug letters are universally recognised
              (A/B/C/D/E/F/G/I/J etc.) and the voltage matters for
              whether their charger needs a converter. */}
          {(city.plugTypes && city.plugTypes.length > 0 || city.voltage) && (
            <div className="flex justify-between items-baseline gap-3 py-px">
              <dt className="text-[9px] text-muted uppercase tracking-[0.14em] font-medium flex-shrink-0">
                Electric
              </dt>
              <dd className="text-ink-deep font-mono text-[11px] truncate text-right">
                {city.plugTypes && city.plugTypes.length > 0 && (
                  <span>{city.plugTypes.slice(0, 3).join('/')}</span>
                )}
                {city.plugTypes && city.plugTypes.length > 0 && city.voltage && (
                  <span aria-hidden className="text-muted mx-1">|</span>
                )}
                {city.voltage && <span>{city.voltage}</span>}
              </dd>
            </div>
          )}
          {city.koppen && (
            // Climate row uses an icon instead of the raw Köppen code.
            // Visual at-a-glance, full code + meaning live in the tooltip.
            <div className="flex justify-between items-center gap-3 py-px">
              <dt className="text-[9px] text-muted uppercase tracking-[0.14em] font-medium flex-shrink-0">
                Climate
              </dt>
              <dd className="text-ink-deep flex items-center">
                <KoppenIcon code={city.koppen} size={14} className="text-ink-deep" />
              </dd>
            </div>
          )}
        </dl>
      </div>
        </div>
      </div>
    </div>
  );
}

// === DriveIcon ===
// Stylised single-lane road with a 🚗 placed on the L or R side. Pure
// SVG so it scales cleanly inside the postcard's tight type scale.
function DriveIcon({ side }: { side: 'L' | 'R' }) {
  // 28x14 viewBox: a horizontal road with a centre dashed line and a
  // car positioned on the appropriate lane.
  return (
    <svg
      viewBox="0 0 28 14"
      width={26}
      height={13}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <rect x={1} y={2} width={26} height={10} rx={1.5} fill="#eceae6" stroke="#9b8b6a" strokeWidth={0.4} />
      <line x1={3} y1={7} x2={25} y2={7} stroke="#9b8b6a" strokeWidth={0.6} strokeDasharray="1.5,1.5" />
      <text
        x={side === 'L' ? 7 : 21}
        y={11}
        fontSize={8}
        textAnchor="middle"
        style={{ pointerEvents: 'none' }}
      >
        🚗
      </text>
    </svg>
  );
}

// Compact glyph + word for tap-water safety. Keeps the postcard's
// "all values right-aligned mono" rhythm intact.
function fmtTapWater(w: string): string {
  switch (w) {
    case 'Safe':        return '✓ Safe';
    case 'Treat first': return '⚠ Treat';
    case 'Not safe':    return '✕ Boil';
    case 'Varies':      return '~ Varies';
    default:            return w;
  }
}

// === Row ===
// Single label/value pair on the postcard front. Labels are uppercase small-
// caps in sans, values are right-aligned monospace so a stack of rows visually
// aligns like an old typewritten ledger. truncate handles overflow.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-px">
      <dt className="text-[9px] text-muted uppercase tracking-[0.14em] font-medium flex-shrink-0">
        {label}
      </dt>
      <dd className="text-ink-deep font-mono text-[11px] truncate text-right" title={value}>
        {value}
      </dd>
    </div>
  );
}
