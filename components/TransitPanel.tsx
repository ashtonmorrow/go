// === TransitPanel ==========================================================
// "Getting around" section on city detail pages. Lists the public-transit
// operators TransitLand knows for the area within ~8 km of the city
// center, grouped by mode for fast scanning.
//
// Server component. Renders nothing when no operators are returned
// (TRANSITLAND_API_KEY missing, sparse coverage, or genuinely no transit).
//
import type { TransitOperator } from '@/lib/transit';

type Props = {
  cityName: string;
  operators: TransitOperator[];
};

// Human label + display order for modes. The order is roughly
// "what a traveler asks about first" — subway, tram, rail, bus, then the
// less common modes.
const MODE_LABELS: Record<string, string> = {
  subway: 'Metro / subway',
  tram: 'Tram / light rail',
  rail: 'Commuter rail',
  bus: 'Bus',
  trolleybus: 'Trolleybus',
  ferry: 'Ferry',
  cable_tram: 'Cable car',
  funicular: 'Funicular',
  aerial_lift: 'Cable / aerial lift',
  monorail: 'Monorail',
};
const MODE_ORDER = [
  'subway',
  'tram',
  'rail',
  'bus',
  'trolleybus',
  'ferry',
  'cable_tram',
  'funicular',
  'aerial_lift',
  'monorail',
];

export default function TransitPanel({ cityName, operators }: Props) {
  if (operators.length === 0) return null;

  // Sort modes by the canonical order, then operators by short_name length
  // (which biases toward the recognizable brand acronyms first).
  const modeBuckets: Record<string, TransitOperator[]> = {};
  for (const op of operators) {
    if (op.modes.length === 0) {
      // Operator without classified modes — bucket under "other"
      (modeBuckets._other ??= []).push(op);
      continue;
    }
    for (const mode of op.modes) {
      (modeBuckets[mode] ??= []).push(op);
    }
  }

  const presentModes = MODE_ORDER.filter(m => modeBuckets[m]?.length);
  const otherOps = modeBuckets._other ?? [];
  if (presentModes.length === 0 && otherOps.length === 0) return null;

  // Render groups in canonical mode order, then the "other" bucket last
  // (operators whose route-type data we couldn't classify, which can
  // happen when the operator response excludes route detail).
  const groups: { key: string; label: string; ops: TransitOperator[] }[] = [
    ...presentModes.map(m => ({
      key: m,
      label: MODE_LABELS[m] ?? m,
      ops: modeBuckets[m],
    })),
  ];
  if (otherOps.length > 0) {
    groups.push({
      key: '_other',
      label: presentModes.length > 0 ? 'Other operators' : 'Local transit operators',
      ops: otherOps,
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep mb-2">Getting around {cityName}</h2>
      <p className="text-small text-slate mb-4">
        Public-transit operators within 8 km of the city center
        {presentModes.length > 0 && <>, grouped by mode</>}. Click through to each
        operator&rsquo;s site for routes, fares, and tickets.
      </p>

      <div className="space-y-4">
        {groups.map(({ key, label, ops }) => (
          <div key={key}>
            <div className="text-micro text-muted uppercase tracking-wide mb-1">
              {label}
            </div>
            <div className="flex flex-wrap gap-2">
              {ops.map(op => {
                const opLabel = op.shortName ?? op.name;
                const title = op.shortName ? `${op.name} (${op.shortName})` : op.name;
                return op.website ? (
                  <a
                    key={`${key}-${op.onestopId}`}
                    href={op.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={title}
                    className="pill bg-cream-soft hover:bg-sand"
                  >
                    {opLabel}
                  </a>
                ) : (
                  <span
                    key={`${key}-${op.onestopId}`}
                    title={title}
                    className="pill bg-cream-soft cursor-default"
                  >
                    {opLabel}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-micro text-muted mt-4">
        Operators via TransitLand.
      </p>
    </section>
  );
}
