import KusttramRouteMap from '@/components/KusttramRouteMapLoader';
import type { SavedListPin } from '@/components/SavedListSection';
import { ROUTE_MAPS } from '@/lib/listRouteMaps';

// Opt-in route map for tram / rail lists. Frontmatter shape:
//   route_map: alicante   # key into ROUTE_MAPS in lib/listRouteMaps.ts
//
// Geometry (label, line color, station-slug segments) lives in code so
// the markdown frontmatter stays readable; only a single key crosses
// the boundary. Returns null when the key isn't registered so an
// authoring typo degrades gracefully instead of breaking the page.
export default function RouteMapBlock({
  routeMapKey,
  pins,
}: {
  routeMapKey: string;
  pins: SavedListPin[];
}) {
  const config = ROUTE_MAPS[routeMapKey];
  if (!config) return null;
  return (
    <KusttramRouteMap
      pins={pins}
      label={config.label}
      lineColor={config.lineColor}
      routeSegments={config.segments.length > 0 ? config.segments : undefined}
    />
  );
}
