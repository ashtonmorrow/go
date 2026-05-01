// === AdvisoryBadge =========================================================
// Renders the U.S. State Department travel-advisory level (1–4) for a
// country, color-coded so the eye picks out the risk band quickly:
//
//   L1  Normal precautions   — quiet teal
//   L2  Increased caution    — amber
//   L3  Reconsider travel    — deeper amber
//   L4  Do not travel        — red
//
// The badge is a link to travel.state.gov so a curious traveller can read
// the full advisory text and any sub-region carve-outs.
//
import { advisoryLevel, advisoryLabel } from '@/lib/travelAdvisory';

type Props = {
  iso2: string | null;
  countryName?: string | null;
};

export default function AdvisoryBadge({ iso2, countryName }: Props) {
  const level = advisoryLevel(iso2, countryName);
  if (!level) return null;

  // Tailwind doesn't get arbitrary HSL backgrounds at build time without
  // a JIT match, so we lean on the existing token palette + opacity.
  const styles: Record<number, string> = {
    1: 'bg-teal/10 text-teal border-teal/30',
    2: 'bg-accent/15 text-accent border-accent/40',
    3: 'bg-accent/30 text-ink-deep border-accent',
    4: 'bg-red-100 text-red-700 border-red-300',
  };
  const label = advisoryLabel(level);

  return (
    <a
      href="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html"
      target="_blank"
      rel="noopener noreferrer"
      className={`card p-4 text-small block hover:opacity-90 transition`}
      title={`U.S. State Department travel advisory level ${level} of 4`}
    >
      <div className="text-muted uppercase tracking-wider text-label">U.S. travel advisory</div>
      <div className={`mt-2 inline-flex items-center gap-2 px-2 py-1 rounded border text-small font-medium ${styles[level]}`}>
        <span className="font-mono">L{level}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 text-muted text-label">travel.state.gov →</div>
    </a>
  );
}
