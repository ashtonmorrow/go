import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import { COLORS } from '@/lib/colors';

// === VisitedMap =============================================================
// Server-rendered SVG world map for the home page. Highlights every country
// that has at least one visited pin in teal, leaves the rest in cream so
// the visited countries read as the figure against a quiet ground.
//
// Why server-rendered SVG (no MapLibre, no JS bundle): the home page is
// load-sensitive and the map is decorative — readers don't need pan,
// zoom, or hover popovers. Pre-projecting the country geometry on the
// server and shipping flat <path> elements keeps the page fast and
// gives the home a calm, illustration-like feel rather than the
// interactive globe vibe of /countries/map.
//
// Geometry comes from the world-atlas npm package (Natural Earth 110m
// resolution; ~100 KB JSON), read off the local filesystem at render
// time. The Next ISR cache holds the rendered SVG output, so the
// projection math runs at most once per revalidate window.
//
// Country matching is name-based, lowercased, with a small alias map
// handling the well-known long/short pairs (United States vs United
// States of America, Czech Republic vs Czechia, etc).

type Props = {
  /** Lowercased names of countries Mike has visited at least once.
   *  Computed server-side from pins.states_names where pin.visited
   *  is true. Pass as Set<string> for O(1) lookup per feature. */
  visitedCountryNames: Set<string>;
  /** Total visited count, surfaced as a small caption under the map.
   *  Could be derived from the set; passing it explicit keeps this
   *  component pure and lets the caller phrase the caption. */
  visitedCount?: number;
  /** SVG viewBox dimensions. The component scales to its container width
   *  via `w-full h-auto`; these set the projection extent. Default
   *  720×360 is the natural Earth aspect (2:1) at a comfortable size. */
  width?: number;
  height?: number;
};

/** Country names where the TopoJSON spelling does not exactly match the
 *  spelling Mike's pins use. Both sides are lowercased before lookup;
 *  this map covers the named-aliases edge cases. The TopoJSON name is
 *  the key; any of the pin-side spellings in the array counts as a
 *  match. */
const NAME_ALIASES: Record<string, string[]> = {
  'united states of america': ['united states', 'usa', 'us'],
  czechia: ['czech republic'],
  russia: ['russian federation'],
  iran: ['iran (islamic republic of)'],
  syria: ['syrian arab republic'],
  'south korea': ['korea (republic of)', 'republic of korea'],
  'north korea': ["korea (democratic people's republic of)"],
  tanzania: ['tanzania, united republic of'],
  venezuela: ['venezuela (bolivarian republic of)'],
  bolivia: ['bolivia (plurinational state of)'],
  vietnam: ['viet nam'],
  laos: ["lao people's democratic republic"],
  myanmar: ['burma'],
  macedonia: ['north macedonia'],
  eswatini: ['swaziland'],
  'cape verde': ['cabo verde'],
  'dominican rep.': ['dominican republic'],
  'central african rep.': ['central african republic'],
  "côte d'ivoire": ['ivory coast', "cote d'ivoire"],
  'dem. rep. congo': ['democratic republic of the congo', 'dr congo'],
  congo: ['republic of the congo'],
  palestine: ['palestinian territory, occupied'],
  taiwan: ['taiwan (province of china)'],
  's. sudan': ['south sudan'],
  'w. sahara': ['western sahara'],
  'eq. guinea': ['equatorial guinea'],
  'falkland is.': ['falkland islands'],
  'solomon is.': ['solomon islands'],
  'bosnia and herz.': ['bosnia and herzegovina'],
};

function isVisited(featureName: string, visited: Set<string>): boolean {
  const lc = featureName.toLowerCase();
  if (visited.has(lc)) return true;
  const aliases = NAME_ALIASES[lc];
  if (!aliases) return false;
  for (const alt of aliases) if (visited.has(alt)) return true;
  return false;
}

type WorldTopology = {
  objects: { countries: { type: string } };
};

export default async function VisitedMap({
  visitedCountryNames,
  visitedCount,
  width = 720,
  height = 360,
}: Props) {
  // Read the world-atlas TopoJSON straight off disk. Importing as a
  // module would inline 100 KB into the build; reading at request
  // time + relying on ISR caching keeps the bundle slim.
  const topoPath = path.join(
    process.cwd(),
    'node_modules',
    'world-atlas',
    'countries-110m.json',
  );
  const topology = JSON.parse(await fs.readFile(topoPath, 'utf8')) as WorldTopology;
  // topojson-client's feature() returns a FeatureCollection when given
  // a geometry collection, which `countries` is. The cast walks through
  // the well-known shape.
  const fc = feature(
    topology as unknown as Parameters<typeof feature>[0],
    topology.objects.countries as unknown as Parameters<typeof feature>[1],
  ) as unknown as { features: Feature<Geometry, { name?: string }>[] };

  const projection = geoNaturalEarth1().fitSize([width, height], {
    type: 'FeatureCollection',
    features: fc.features,
  } as never);
  const pathGen = geoPath(projection);

  return (
    <Link
      href="/countries/cards"
      className="group block card overflow-hidden hover:shadow-paper transition-shadow"
      aria-label="Open the world map of every country I have visited"
    >
      <div className="bg-cream-soft p-3 sm:p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          role="img"
          aria-label="World map with countries I have visited shaded teal."
        >
          {fc.features.map((f, i) => {
            const name = f.properties?.name ?? '';
            const visited = isVisited(name, visitedCountryNames);
            const d = pathGen(f);
            if (!d) return null;
            return (
              <path
                key={(f.id as string) ?? `${name}-${i}`}
                d={d}
                fill={visited ? COLORS.teal : COLORS.cream}
                stroke={COLORS.sand}
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {typeof visitedCount === 'number' && (
          <p className="mt-2 text-label text-muted text-center tabular-nums">
            {visitedCount} {visitedCount === 1 ? 'country' : 'countries'} visited
            <span className="ml-2 text-teal group-hover:underline">
              Open the country map →
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}
