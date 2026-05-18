// === Pin detail-page sections ==============================================
// Presentational sections lifted out of app/pins/[slug]/page.tsx. These are
// all server components (WikipediaSection streams behind a <Suspense>); each
// takes an explicit `pin` (or narrow props) and closes over nothing from the
// page, so the move was a straight cut-and-paste.

import type { ReactNode } from 'react';
import type { Pin, PinOpeningHours, PinHoursDetails } from '@/lib/pins';
import { parseHours, DAY_LABELS, type DayKey } from '@/lib/parseHours';
import { admissionView } from '@/lib/admission';
import {
  STATUS_FACET,
  BOOKING_FACET,
  CROWD_FACET,
  TIME_OF_DAY_FACET,
  monthRange,
} from '@/lib/pinFacets';
import { fetchWikipediaSummary, titleFromWikipediaUrl } from '@/lib/wikipedia';
import WikipediaAttribution from '@/components/WikipediaAttribution';
import {
  formatPerNightPrice,
  formatNightsCount,
  formatVisitYear,
} from '@/lib/hotelReview';

export function PlanSection({ pin, admissionLabel }: { pin: Pin; admissionLabel: string | null }) {
  // Hotels and restaurants get their own pricing in the kind-specific section
  // (room_price_per_night, etc.), so admission/cost is suppressed here.
  const isHotel = pin.kind === 'hotel';
  const isRestaurant = pin.kind === 'restaurant';
  const isPark = pin.kind === 'park';
  const isTransit = pin.kind === 'transit';
  const heading =
    isHotel ? 'Plan your stay' :
    isRestaurant ? 'Plan your meal' :
    isPark ? 'When to visit' :
    isTransit ? 'Using this stop' :
    'Plan your visit';

  // Hours: skip empty {} hours_details placeholder.
  const hoursDetailsHasData =
    pin.hoursDetails && (
      !!pin.hoursDetails.weekly ||
      !!pin.hoursDetails.ramadan ||
      !!pin.hoursDetails.parent_site ||
      !!pin.hoursDetails.type ||
      (Array.isArray(pin.hoursDetails.notes) && pin.hoursDetails.notes.length > 0)
    );
  const showHours = !isHotel && (hoursDetailsHasData || pin.openingHours || pin.hours);

  const showCost =
    !isHotel && !isRestaurant && (
      admissionLabel != null ||
      pin.freeToVisit != null ||
      pin.free === true ||
      pin.admission ||
      pin.priceText ||
      pin.priceAmount != null
    );
  const showTiming = !isHotel && (pin.bestMonths.length || pin.worstMonths.length || pin.bestTimeOfDay.length || pin.crowdLevel);
  const showBooking = pin.booking || pin.bookingRequired != null || pin.bookingUrl || pin.officialTicketUrl;
  const showStatus = pin.status && pin.status !== 'active';

  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h2 text-ink-deep mb-4">{heading}</h2>

      {showStatus && pin.status && (
        <div className="mb-4 px-3 py-2 rounded bg-orange/10 text-orange text-small">
          <strong>{STATUS_FACET[pin.status].label}.</strong>
          {pin.closureReason && <span className="ml-1">{pin.closureReason}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {showHours && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">Hours</h3>
            <HoursBlock hoursDetails={pin.hoursDetails} openingHours={pin.openingHours} raw={pin.hours} />
            {pin.closureDays.length > 0 && (
              <p className="mt-2 text-label text-muted">
                Also closed: {pin.closureDays.join(', ')}
              </p>
            )}
          </div>
        )}

        {showCost && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">
              {isTransit ? 'Fare' : 'Admission'}
            </h3>
            <AdmissionBlock pin={pin} fallback={admissionLabel} />
          </div>
        )}

        {showBooking && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">Booking</h3>
            {pin.booking && <p className="text-ink">{BOOKING_FACET[pin.booking].label}</p>}
            {!pin.booking && pin.bookingRequired === true && (
              <p className="text-ink">Booking required</p>
            )}
            {!pin.booking && pin.bookingRequired === false && (
              <p className="text-ink">No booking needed</p>
            )}
            {pin.bookingUrl && (
              <a href={pin.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline text-small block mt-1">
                Reserve →
              </a>
            )}
            {!pin.bookingUrl && pin.officialTicketUrl && (
              <a href={pin.officialTicketUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline text-small block mt-1">
                Official tickets →
              </a>
            )}
          </div>
        )}

        {(pin.hoursSourceUrl || pin.priceSourceUrl) && (
          <div className="sm:col-span-2 text-label text-muted">
            Sources:{' '}
            {pin.hoursSourceUrl && (
              <a href={pin.hoursSourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-teal underline">
                hours
              </a>
            )}
            {pin.hoursSourceUrl && pin.priceSourceUrl && ' · '}
            {pin.priceSourceUrl && (
              <a href={pin.priceSourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-teal underline">
                pricing
              </a>
            )}
          </div>
        )}

        {showTiming && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">When to go</h3>
            <ul className="text-small text-ink space-y-1">
              {pin.bestMonths.length > 0 && (
                <li><span className="text-muted">Best:</span> {monthRange(pin.bestMonths)}</li>
              )}
              {pin.worstMonths.length > 0 && (
                <li><span className="text-muted">Avoid:</span> {monthRange(pin.worstMonths)}</li>
              )}
              {pin.bestTimeOfDay.length > 0 && (
                <li>
                  <span className="text-muted">Time of day:</span>{' '}
                  {pin.bestTimeOfDay.map(t => TIME_OF_DAY_FACET[t].label).join(', ')}
                </li>
              )}
              {pin.crowdLevel && (
                <li><span className="text-muted">Crowds:</span> {CROWD_FACET[pin.crowdLevel].label}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function AdmissionBlock({ pin, fallback }: { pin: Pin; fallback: string | null }) {
  const view = admissionView(pin);
  if (view.kind === 'free') {
    return (
      <>
        <p className="text-teal font-medium">Free</p>
        {view.note && <p className="mt-1 text-small text-ink leading-relaxed">{view.note}</p>}
      </>
    );
  }
  if (view.kind === 'paid' && view.tiers.length) {
    return (
      <>
        <dl className="text-small">
          {view.tiers.map((t, i) => (
            <div key={`${t.label}-${i}`} className="flex justify-between gap-3 py-0.5">
              <dt className="text-slate">{t.label}</dt>
              <dd className="text-ink-deep tabular-nums font-mono">{t.formatted}</dd>
            </div>
          ))}
        </dl>
        {view.notes.length > 0 && (
          <ul className="mt-2 text-label text-muted leading-relaxed space-y-0.5">
            {view.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </>
    );
  }
  if (view.kind === 'paid' && view.note) {
    return <p className="text-ink leading-relaxed text-small">{view.note}</p>;
  }
  return fallback ? <p className="text-ink text-small">{fallback}</p> : <p className="text-muted text-small">Pricing unknown</p>;
}

/** Hotel pin review section. Reads the generated review and visit metadata
 *  directly off the pin row. Renders only when the pin is kind=hotel AND has
 *  a generatedReview (the same condition that flips it from noindex). */
export function HotelReviewSection({ pin }: { pin: Pin }) {
  const period = formatVisitYear(pin.visitYear);
  const nights = formatNightsCount(pin.nightsStayed);
  const price = formatPerNightPrice({
    cashAmount: pin.roomPricePerNight,
    cashCurrency: pin.roomPriceCurrency,
    pointsAmount: pin.pointsAmount,
    pointsProgram: pin.pointsProgram,
    nights: pin.nightsStayed,
  });
  const meta = [period, nights, pin.roomType, price]
    .filter((s): s is string => !!s && s.length > 0)
    .join(' · ');
  const ratingStars =
    pin.personalRating != null && pin.personalRating > 0
      ? '⭐'.repeat(Math.min(5, pin.personalRating))
      : null;
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small text-muted">
        {meta && <span>{meta}</span>}
        {ratingStars && (
          <span aria-label={`${pin.personalRating} out of 5`} className="text-amber-500">
            {ratingStars}
          </span>
        )}
      </div>
      {pin.generatedReview && (
        <div className="mt-3 text-ink leading-relaxed text-prose whitespace-pre-line">
          {pin.generatedReview}
        </div>
      )}
      {pin.wouldStayAgain != null && (
        <p className="mt-3 text-small text-slate">
          {pin.wouldStayAgain
            ? `Would stay at ${pin.name} again.`
            : `Would not stay at ${pin.name} again.`}
        </p>
      )}
    </section>
  );
}

export function PersonalSection({ pin }: { pin: Pin }) {
  const universal =
    pin.personalRating != null ||
    pin.personalReview ||
    pin.visitYear != null ||
    pin.companions.length > 0;

  const hasHotel =
    pin.kind === 'hotel' &&
    (pin.nightsStayed != null ||
      pin.roomType ||
      pin.roomPricePerNight != null ||
      pin.wouldStayAgain != null ||
      pin.hotelVibe.length ||
      pin.breakfastQuality ||
      pin.wifiQuality ||
      pin.noiseLevel ||
      pin.locationPitch);

  const hasMeal =
    pin.kind === 'restaurant' &&
    (pin.cuisine.length ||
      pin.mealTypes.length ||
      pin.dishesTried.length ||
      pin.dietaryOptions.length ||
      pin.reservationRecommended != null ||
      pin.priceTier != null ||
      pin.pricePerPersonUsd != null ||
      (pin.priceLevel != null && pin.priceLevel > 0));

  if (!universal && !hasHotel && !hasMeal) return null;

  const heading =
    pin.kind === 'hotel' ? "Mike's stay" :
    pin.kind === 'restaurant' ? "Mike's meal" :
    "Mike's review";

  return (
    <section className="rounded-xl border border-sand bg-cream-soft/60 p-5 sm:p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-h3 text-ink-deep leading-tight">{heading}</h2>
        {pin.visitYear != null && (
          <span className="text-label uppercase tracking-wider text-muted">
            Visited {pin.visitYear}
          </span>
        )}
      </header>

      {universal && (pin.personalRating != null || pin.bestFor.length > 0 || pin.companions.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small">
          {pin.personalRating != null && (
            <span
              aria-label={`${pin.personalRating} out of 5 stars`}
              className="inline-flex items-center text-base leading-none tabular-nums"
            >
              <span aria-hidden>{'⭐'.repeat(pin.personalRating)}</span>
              <span aria-hidden className="text-slate/40 ml-0.5">
                {'☆'.repeat(5 - pin.personalRating)}
              </span>
            </span>
          )}
          {pin.bestFor.length > 0 && (
            <span className="text-muted text-small">
              best for {pin.bestFor.join(', ')}
            </span>
          )}
          {pin.companions.length > 0 && (
            <span className="text-muted text-small">
              with {pin.companions.join(', ')}
            </span>
          )}
        </div>
      )}

      {hasHotel && (
        <>
          {pin.hotelVibe.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {pin.hotelVibe.map(v => (
                <span key={v} className="pill bg-cream-soft text-ink-deep capitalize">{v}</span>
              ))}
            </div>
          )}
          <dl className="text-small space-y-1.5 mb-4">
            {pin.nightsStayed != null && (
              <FactRow label="Nights">
                {pin.nightsStayed} {pin.nightsStayed === 1 ? 'night' : 'nights'}
              </FactRow>
            )}
            {pin.roomType && <FactRow label="Room">{pin.roomType}</FactRow>}
            {pin.roomPricePerNight != null && (
              <FactRow label="Per night">
                <span className="font-mono tabular-nums">
                  {pin.roomPriceCurrency ? `${pin.roomPriceCurrency} ` : ''}
                  {pin.roomPricePerNight}
                </span>
              </FactRow>
            )}
            {pin.locationPitch && <FactRow label="Location">{pin.locationPitch}</FactRow>}
            {pin.breakfastQuality && <FactRow label="Breakfast">{pin.breakfastQuality}</FactRow>}
            {pin.wifiQuality && <FactRow label="Wifi">{pin.wifiQuality}</FactRow>}
            {pin.noiseLevel && <FactRow label="Noise">{pin.noiseLevel}</FactRow>}
            {pin.wouldStayAgain === true && (
              <FactRow label="Verdict"><span className="text-teal">Would stay again</span></FactRow>
            )}
            {pin.wouldStayAgain === false && (
              <FactRow label="Verdict"><span className="text-orange">Wouldn&rsquo;t stay again</span></FactRow>
            )}
          </dl>
        </>
      )}

      {hasMeal && (
        <dl className="text-small space-y-1.5 mb-4">
          {(pin.priceTier || pin.pricePerPersonUsd != null || (pin.priceLevel != null && pin.priceLevel > 0)) && (
            <FactRow label="Price">
              <span className="inline-flex items-baseline gap-2">
                {pin.priceTier ? (
                  <span className="font-mono text-ink-deep tabular-nums">{pin.priceTier}</span>
                ) : pin.priceLevel != null && pin.priceLevel > 0 ? (
                  <span
                    className="font-mono text-slate tabular-nums"
                    title="Approximate price level from Google"
                  >
                    {'$'.repeat(Math.min(4, pin.priceLevel))}
                  </span>
                ) : null}
                {pin.pricePerPersonUsd != null && (
                  <span className="text-muted text-small">
                    ~${pin.pricePerPersonUsd.toLocaleString()}/person
                  </span>
                )}
              </span>
            </FactRow>
          )}
          {pin.cuisine.length > 0 && (
            <FactRow label="Cuisine">
              <span className="flex flex-wrap gap-1">
                {pin.cuisine.map(c => (
                  <span key={c} className="pill bg-cream-soft text-ink-deep capitalize">{c}</span>
                ))}
              </span>
            </FactRow>
          )}
          {pin.mealTypes.length > 0 && (
            <FactRow label="Best for">{pin.mealTypes.join(', ')}</FactRow>
          )}
          {pin.dishesTried.length > 0 && (
            <FactRow label="Tried">{pin.dishesTried.join(' · ')}</FactRow>
          )}
          {pin.dietaryOptions.length > 0 && (
            <FactRow label="Dietary">{pin.dietaryOptions.join(', ')}</FactRow>
          )}
          {pin.reservationRecommended === true && (
            <FactRow label="Reservation">Recommended</FactRow>
          )}
          {pin.reservationRecommended === false && (
            <FactRow label="Reservation">Walk-ins welcome</FactRow>
          )}
        </dl>
      )}

      {pin.personalReview && (
        <blockquote className="text-prose text-ink leading-relaxed whitespace-pre-line border-l-2 border-accent/50 pl-4">
          {pin.personalReview}
        </blockquote>
      )}
    </section>
  );
}

/** Render-only body for the "Good to know" content — renders under an h3
 *  sub-heading inside the combined "Features & amenities" section. */
export function GoodToKnowContent({
  pin,
  facets,
}: {
  pin: Pin;
  facets: { label: string; icon: string }[];
}) {
  return (
    <>
      {facets.length > 0 && <FacetGrid items={facets} className="mb-4" />}
      <dl className="text-small space-y-2">
        {pin.dressCode && (
          <FactRow label="Dress code">{pin.dressCode}</FactRow>
        )}
        {pin.minAgeRecommended != null && (
          <FactRow label="Recommended age">{pin.minAgeRecommended}+</FactRow>
        )}
        {pin.languagesOffered.length > 0 && (
          <FactRow label="Languages">{pin.languagesOffered.join(', ')}</FactRow>
        )}
        {pin.safetyNotes && (
          <FactRow label="Safety">{pin.safetyNotes}</FactRow>
        )}
        {pin.scamWarning && (
          <FactRow label="Watch out for">
            <span className="text-orange">{pin.scamWarning}</span>
          </FactRow>
        )}
      </dl>
    </>
  );
}

export function FacetGrid({ items, className }: { items: { label: string; icon: string }[]; className?: string }) {
  return (
    <ul className={'grid grid-cols-1 sm:grid-cols-2 gap-2 ' + (className ?? '')}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-small text-ink">
          <span aria-hidden className="text-teal mt-0.5">●</span>
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

const HOURS_DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function HoursBlock({
  hoursDetails,
  openingHours,
  raw,
}: {
  hoursDetails: PinHoursDetails | null;
  openingHours: PinOpeningHours | null;
  raw: string | null;
}) {
  const todayIdx = new Date().getDay();
  const todayKey: DayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as DayKey[])[todayIdx];

  const hasHoursDetailsData =
    hoursDetails && (
      !!hoursDetails.weekly ||
      !!hoursDetails.ramadan ||
      !!hoursDetails.parent_site ||
      !!hoursDetails.type ||
      (Array.isArray(hoursDetails.notes) && hoursDetails.notes.length > 0)
    );
  if (hasHoursDetailsData && hoursDetails) {
    const w = hoursDetails.weekly ?? null;
    const dailyText = w?.daily;
    const populatedDays = w
      ? HOURS_DAY_ORDER.filter(d => {
          const t = (w as Record<string, string | undefined>)[d];
          return typeof t === 'string' && t.trim().length > 0;
        })
      : [];
    const allDaysEmpty = w && !dailyText && populatedDays.length === 0;
    return (
      <div className="text-small">
        {dailyText ? (
          <p className="text-ink font-mono">Daily {dailyText}</p>
        ) : allDaysEmpty ? (
          <NoHoursPlaceholder />
        ) : w ? (
          <dl className="font-mono">
            {HOURS_DAY_ORDER.map(d => {
              const text = (w as Record<string, string | undefined>)[d];
              const hasText = typeof text === 'string' && text.trim().length > 0;
              const isToday = d === todayKey;
              return (
                <div
                  key={d}
                  className={'flex items-baseline justify-between gap-3 py-0.5 ' + (isToday ? 'text-teal font-semibold' : 'text-ink')}
                >
                  <dt className="w-12 text-micro uppercase tracking-wider flex-shrink-0">
                    {DAY_LABELS[d]}
                    {isToday && <span aria-hidden className="ml-1 text-micro">●</span>}
                  </dt>
                  <dd className={'tabular-nums ' + (hasText ? '' : 'text-muted/70')}>
                    {hasText ? text : '—'}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}
        {hoursDetails.ramadan?.daily && (
          <p className="mt-2 text-label text-muted">
            Ramadan: {hoursDetails.ramadan.daily}
          </p>
        )}
        {hoursDetails.parent_site && (
          <p className="mt-1 text-label text-muted">
            Hours follow {hoursDetails.parent_site}.
          </p>
        )}
        {Array.isArray(hoursDetails.notes) && hoursDetails.notes.length > 0 && (
          <ul className="mt-2 text-label text-muted leading-relaxed space-y-0.5">
            {hoursDetails.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (openingHours) {
    const allDaysEmpty = HOURS_DAY_ORDER.every(d => {
      const intervals = (openingHours as Record<string, string[] | undefined>)[d];
      return !intervals || intervals.length === 0;
    });
    if (allDaysEmpty && !openingHours.notes) {
      return <NoHoursPlaceholder />;
    }
    return (
      <dl className="text-small font-mono">
        {HOURS_DAY_ORDER.map(d => {
          const intervals = (openingHours as Record<string, string[] | undefined>)[d];
          const isToday = d === todayKey;
          const hasIntervals = !!intervals && intervals.length > 0;
          return (
            <div
              key={d}
              className={'flex items-baseline justify-between gap-3 py-0.5 ' + (isToday ? 'text-teal font-semibold' : 'text-ink')}
            >
              <dt className="w-12 text-micro uppercase tracking-wider flex-shrink-0">
                {DAY_LABELS[d]}
                {isToday && <span aria-hidden className="ml-1 text-micro">●</span>}
              </dt>
              <dd className={'tabular-nums ' + (hasIntervals ? '' : 'text-muted/70')}>
                {hasIntervals ? intervals.join(', ') : '—'}
              </dd>
            </div>
          );
        })}
        {openingHours.notes && (
          <p className="mt-2 text-label text-muted font-sans leading-relaxed">{openingHours.notes}</p>
        )}
      </dl>
    );
  }

  if (!raw) return null;

  const parsed = parseHours(raw);
  if (!parsed?.structured) {
    return <p className="text-ink leading-relaxed whitespace-pre-line text-small">{raw}</p>;
  }

  return (
    <dl className="text-small font-mono">
      {parsed.structured.map(d => {
        const isToday = d.day === todayKey;
        return (
          <div
            key={d.day}
            className={'flex items-baseline justify-between gap-3 py-0.5 ' + (isToday ? 'text-teal font-semibold' : 'text-ink')}
          >
            <dt className="w-12 text-micro uppercase tracking-wider flex-shrink-0">
              {DAY_LABELS[d.day]}
              {isToday && <span aria-hidden className="ml-1 text-micro">●</span>}
            </dt>
            <dd className="tabular-nums">{d.closed ? 'Closed' : `${d.open}–${d.close}`}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Placeholder shown when a pin has hours fields but every per-day cell is
 *  empty — "we haven't annotated this yet", not "closed every day". */
function NoHoursPlaceholder() {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-cream-soft border border-sand text-small text-muted">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-shrink-0">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>Hours haven&rsquo;t been added yet.</span>
    </div>
  );
}

/** Streamed Wikipedia block. Lives behind a <Suspense> on the pin page so
 *  the rest of the article doesn't gate first byte on a third-party REST
 *  call. Returns null on cache miss + slow Wikipedia. */
export async function WikipediaSection({ wikipediaUrl }: { wikipediaUrl: string | null }) {
  const wp = await fetchWikipediaSummary(titleFromWikipediaUrl(wikipediaUrl));
  if (!wp?.extract) return null;
  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h2 text-ink-deep mb-4">From Wikipedia</h2>
      <p className="text-ink leading-relaxed text-prose">{wp.extract}</p>
      <a
        href={wp.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-small text-teal hover:underline"
      >
        Read more on Wikipedia →
      </a>
      <WikipediaAttribution title={wp.title} url={wp.url} />
    </section>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="text-ink-deep text-right">{children}</dd>
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="text-slate sm:w-32 flex-shrink-0">{label}</dt>
      <dd className="text-ink-deep leading-relaxed">{children}</dd>
    </div>
  );
}
