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

/** Helper: build the final href for an action. Phone gets a tel:
 *  rewrite (digits + leading +). Everything else gets the UTM-tagged
 *  outbound URL so we can see in analytics which pin sent the
 *  outbound click. */
function actionHref(a: Action): string {
  return a.variant === 'phone'
    ? `tel:${a.href.replace(/[^+0-9]/g, '')}`
    : withUtm(a.href, { medium: 'pin-detail-action', campaign: a.campaign });
}

function ActionLink({
  action,
  className,
  showIcon = true,
  showLabel = true,
}: {
  action: Action;
  className: string;
  showIcon?: boolean;
  showLabel?: boolean;
}) {
  const href = actionHref(action);
  const inner = (
    <>
      {showIcon && <ActionIcon variant={action.variant} />}
      {showLabel && <span>{action.label}</span>}
    </>
  );
  if (action.variant === 'phone') {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  );
}

export default function PinActionBar({ candidates }: Props) {
  const live: Action[] = candidates
    .filter(c => typeof c.href === 'string' && c.href.length > 0)
    .map(c => ({ ...c, href: c.href as string }));
  if (live.length === 0) return null;

  return (
    <>
      {/* Inline bar — visible at all viewport widths so the actions
          sit near the hero on desktop. On mobile this is still useful
          for visitors who scroll back up, plus it provides a real
          tab-order anchor for keyboard users (the sticky variant is
          a duplicate, not a primary). */}
      <div className="mt-6 flex flex-wrap gap-2">
        {live.map((a, i) => {
          const isPrimary = i === 0;
          const className =
            'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-small font-medium transition-colors ' +
            (isPrimary
              ? 'bg-teal text-white border border-teal hover:bg-teal/90'
              : 'bg-white text-ink-deep border border-sand hover:bg-cream-soft');
          return (
            <ActionLink
              key={`inline-${a.variant}-${a.href}`}
              action={a}
              className={className}
            />
          );
        })}
      </div>

      {/* Sticky bottom bar — mobile only (md:hidden). Pins to the
          viewport bottom with a backdrop blur so the page content
          showing through reads cleanly. Industry-standard pattern
          (Google Maps, Yelp, Airbnb, Apple Maps) for place-detail
          pages: the visitor can scroll the whole page without losing
          access to Directions / Book / Call.

          aria-hidden because the inline bar above is the canonical
          tab-stop for keyboard users; sighted touch users get this
          one. The article wrapper on /pins/[slug] should pad-bottom
          to leave room for this fixed element (handled in page.tsx). */}
      <div
        aria-hidden
        className="
          fixed bottom-0 inset-x-0 z-40 md:hidden
          bg-white/95 backdrop-blur-md
          border-t border-sand
          px-3 py-2.5
          flex gap-2
          shadow-[0_-2px_8px_rgba(0,0,0,0.04)]
        "
      >
        {live.slice(0, 2).map((a, i) => {
          const isPrimary = i === 0;
          const className =
            'flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-small font-medium transition-colors ' +
            (isPrimary
              ? 'bg-teal text-white border border-teal hover:bg-teal/90'
              : 'bg-white text-ink-deep border border-sand hover:bg-cream-soft');
          return (
            <ActionLink
              key={`sticky-${a.variant}-${a.href}`}
              action={a}
              className={className}
            />
          );
        })}
      </div>
    </>
  );
}
