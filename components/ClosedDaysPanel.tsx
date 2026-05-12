// === ClosedDaysPanel =======================================================
// "When things are closed" — upcoming public holidays in the country
// where this city sits, plus a standing note for countries with strict
// Sunday-closure laws.
//
// Renders as a server component; awaits date.nager.at via lib/holidays.ts
// directly (the ISR cache makes the fetch cheap on warm pages).
// Returns null when the country has no ISO-2 code or the holiday API has
// no data for it.
//
import { fetchUpcomingHolidays } from '@/lib/holidays';
import { STRICT_SUNDAY_CLOSURE } from '@/lib/sundayClosures';

type Props = {
  countryIso2: string | null;
  countryName: string | null;
  /** Maximum number of holidays to render. Default 6. */
  limit?: number;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatHolidayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function dayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

export default async function ClosedDaysPanel({
  countryIso2,
  countryName,
  limit = 6,
}: Props) {
  if (!countryIso2) return null;
  const holidays = await fetchUpcomingHolidays(countryIso2);
  if (holidays.length === 0) return null;

  const visible = holidays.slice(0, limit);
  const sundayNote = STRICT_SUNDAY_CLOSURE[countryIso2.toUpperCase()];

  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep mb-2">When things are closed</h2>
      <p className="text-small text-slate mb-4">
        Upcoming public holidays in {countryName ?? 'this country'}. On these dates,
        expect banks, post offices, and government services to close. Many shops and
        museums close or run shortened hours; transit typically still runs.
      </p>

      <div className="space-y-2 mb-4">
        {visible.map(h => (
          <div
            key={`${h.date}-${h.name}`}
            className="flex items-baseline justify-between gap-3 border-b border-sand pb-2 last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="text-small text-ink-deep">
                {h.localName}
                {h.localName !== h.name && (
                  <span className="text-muted"> &middot; {h.name}</span>
                )}
              </div>
              {!h.global && (
                <div className="text-micro text-muted">Regional, not nationwide</div>
              )}
            </div>
            <div className="text-small text-slate font-mono whitespace-nowrap text-right">
              <div>{formatHolidayDate(h.date)}</div>
              <div className="text-micro text-muted">{dayOfWeek(h.date)}</div>
            </div>
          </div>
        ))}
      </div>

      {sundayNote && (
        <p className="text-small text-slate bg-cream-soft border border-sand rounded-md p-3">
          <span className="font-semibold text-ink-deep">Sundays:</span> {sundayNote}
        </p>
      )}

      <p className="text-micro text-muted mt-3">
        Public holidays sourced from date.nager.at.
      </p>
    </section>
  );
}
