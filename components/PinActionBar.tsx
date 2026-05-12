// === PinActionBar ==========================================================
// Compact row of primary CTAs near the top of /pins/[slug], one industry-
// standard place-detail-page pattern (Google Maps, Apple Maps, Airbnb all
// surface the same controls inline at the top of the card). Replaces the
// right-rail "Plan a visit" card that used to consume 200+ vertical pixels
// of the sidebar; the rail now carries reference data only.
//
// Buttons are surfaced in priority order. The first one with a destination
// renders as the teal primary; the rest are secondary outline buttons.
// Buttons with no destination simply don't render — there is no disabled
// state because the action wouldn't be available at all in that case.
//
import { withUtm } from '@/lib/utm';

type ActionVariant = 'directions' | 'book' | 'website' | 'phone' | 'tickets';

type Action = {
  href: string;
  label: string;
  variant: ActionVariant;
  campaign: string;
};

type Props = {
  /** All actions to consider. Empty/null URLs are ignored. Order matters:
   *  the first kept action becomes the primary CTA. */
  candidates: Array<Omit<Action, 'href'> & { href: string | null | undefined }>;
};

// Inline SVG icons sized for the button row. The set is intentionally
// minimal — Heroicons-shaped outlines that match the rest of the rail.
function ActionIcon({ variant }: { variant: ActionVariant }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (variant) {
    case 'directions':
      // Compass arrow inside a square.
      return (
        <svg {...common}>
          <path d="m14.5 8.5-5 2 2 5 2-5z" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      );
    case 'book':
    case 'tickets':
      // Ticket stub.
      return (
        <svg {...common}>
          <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V9z" />
          <path d="M14 7v10" strokeDasharray="2 2" />
        </svg>
      );
    case 'website':
      // Globe.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'phone':
      // Handset.
      return (
        <svg {...common}>
          <path d="M5 4a2 2 0 0 1 2-2h2.4a1 1 0 0 1 .96.73l1 3.5a1 1 0 0 1-.27 1L9 9a12 12 0 0 0 6 6l1.77-2.09a1 1 0 0 1 1-.27l3.5 1a1 1 0 0 1 .73.96V17a2 2 0 0 1-2 2h-1A15 15 0 0 1 5 5V4z" />
        </svg>
      );
  }
}

export default function PinActionBar({ candidates }: Props) {
  const live: Action[] = candidates
    .filter(c => typeof c.href === 'string' && c.href.length > 0)
    .map(c => ({ ...c, href: c.href as string }));
  if (live.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {live.map((a, i) => {
        const isPrimary = i === 0;
        const href =
          a.variant === 'phone'
            ? `tel:${a.href.replace(/[^+0-9]/g, '')}`
            : withUtm(a.href, { medium: 'pin-detail-action', campaign: a.campaign });
        const className =
          'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-small font-medium transition-colors ' +
          (isPrimary
            ? 'bg-teal text-white border border-teal hover:bg-teal/90'
            : 'bg-white text-ink-deep border border-sand hover:bg-cream-soft');
        return a.variant === 'phone' ? (
          <a key={`${a.variant}-${a.href}`} href={href} className={className}>
            <ActionIcon variant={a.variant} />
            <span>{a.label}</span>
          </a>
        ) : (
          <a
            key={`${a.variant}-${a.href}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            <ActionIcon variant={a.variant} />
            <span>{a.label}</span>
          </a>
        );
      })}
    </div>
  );
}
