// === Pin detail-page helpers ===============================================
// Pure (non-React) logic lifted out of app/pins/[slug]/page.tsx: the
// indexability gate, geo math for the "More near here" block, the Sources
// card builders, and the auto-generated FAQ schema. Kept here so the page
// file is a page (fetch + render) rather than a page plus a utility library.

import type { Pin } from '@/lib/pins';

/** A pin is "thin" when there's nothing on the page that adds value beyond
 *  Wikipedia: not visited, no personal review, no curated list membership,
 *  no hours / price / admission detail. Those pages get noindex,follow so
 *  Google doesn't treat them as duplicate content while still crawling
 *  outward through their internal links. They stay in the sitemap so the
 *  bot picks them up automatically once richer data lands. */
export function isThinPin(pin: Pin, hasFileContent: boolean): boolean {
  if (hasFileContent) return false; // editorial markdown lifts the floor
  if (pin.visited) return false;
  if (pin.personalReview && pin.personalReview.trim().length > 0) return false;
  if ((pin.lists?.length ?? 0) > 0) return false;
  if (pin.hours && pin.hours.trim().length > 0) return false;
  if (pin.priceAmount != null || pin.priceText) return false;
  if (pin.hoursDetails && Object.keys(pin.hoursDetails).length > 0) return false;
  if (pin.priceDetails && Object.keys(pin.priceDetails).length > 0) return false;
  return true;
}

// === Geo helpers ============================================================

/** Haversine-formula great-circle distance in kilometers. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Pick up to `limit` nearest pins inside `radiusKm`. Skips the source pin
 *  and any pin without coords. Returned in ascending-distance order. */
export function computeRelatedPins(
  source: Pin,
  candidates: Pin[],
  limit = 4,
  radiusKm = 5,
): { pin: Pin; distanceKm: number }[] {
  if (source.lat == null || source.lng == null) return [];
  const out: { pin: Pin; distanceKm: number }[] = [];
  for (const c of candidates) {
    if (c.id === source.id) continue;
    if (c.lat == null || c.lng == null) continue;
    // Cheap lat/lng box pre-filter before the haversine trig call.
    if (Math.abs(c.lat - source.lat) > 0.1) continue;
    if (Math.abs(c.lng - source.lng) > 0.1) continue;
    const d = haversineKm(source.lat, source.lng, c.lat, c.lng);
    if (d <= radiusKm) out.push({ pin: c, distanceKm: d });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, limit);
}

/** Human-readable distance string. Sub-100m renders as meters. */
export function formatDistance(km: number): string {
  if (km < 0.1) return `${Math.round(km * 1000)} m`;
  if (km < 1) return `${(km * 1000 / 100 | 0) * 100} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Minutes → "45 min" / "2 hr" / "1 hr 30 min". */
export function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hours} hr`;
  return `${hours} hr ${rem} min`;
}

// === Sources card ===========================================================

export type PinSourceLink = {
  label: string;
  href: string;
  campaign: string;
};

function isGooglePlacesSource(sourceType: string | null): boolean {
  return sourceType === 'google-place-details' || sourceType === 'google_places_place_details';
}

export function buildSourceLinks(pin: Pin): PinSourceLink[] {
  const links: PinSourceLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string | null, campaign: string) => {
    if (!href) return;
    const key = href.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ label, href, campaign });
  };

  const hasGoogleSource = !!pin.googlePlaceUrl || !!pin.enrichmentSourceType?.startsWith('google');
  add('Official website', pin.website, 'official-website');
  add(
    isGooglePlacesSource(pin.enrichmentSourceType) ? 'Google Places' : 'Google Maps',
    hasGoogleSource ? (pin.googlePlaceUrl ?? pin.googleMapsUrl) : null,
    'google-maps',
  );
  add('Hours source', pin.hoursSourceUrl, 'hours-source');
  add('Pricing source', pin.priceSourceUrl, 'pricing-source');
  add('UNESCO', pin.unescoUrl, 'unesco');
  add('Wikipedia', pin.wikipediaUrl, 'wikipedia');
  add(pin.wikidataQid ? `Wikidata (${pin.wikidataQid})` : 'Wikidata', pin.wikidataUrl, 'wikidata');

  return links;
}

export function enrichmentSourceLabel(sourceType: string | null): string | null {
  switch (sourceType) {
    case 'google-place-details':
    case 'google_places_place_details':
      return 'Google Places data';
    case 'google-location-lookup':
      return 'Google location data';
    case 'wikidata':
      return 'Wikidata data';
    case 'manual':
      return 'Manual data';
    default:
      return sourceType ? `${sourceType.replace(/[-_]/g, ' ')} data` : null;
  }
}

export function formatSourceDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

// === FAQ schema =============================================================

/** Auto-generate a FAQPage JSON-LD from whatever structured fields the pin
 *  has. Only emits when at least two answer-worthy facts exist (Google's
 *  rich-result threshold). Invisible on the page — it lives in head as
 *  schema so pin pages can compete for "what time does X close" /
 *  "how much does X cost" long-tail via the People Also Ask surface. */
export function pinFaqJsonLd(pin: Pin, url: string): Record<string, unknown> | null {
  const faqs: { q: string; a: string }[] = [];

  if (pin.hours && pin.hours.trim().length > 4) {
    faqs.push({
      q: `What are the opening hours of ${pin.name}?`,
      a: pin.hours,
    });
  }

  if (pin.priceText) {
    faqs.push({
      q: `How much does it cost to visit ${pin.name}?`,
      a: pin.priceText,
    });
  } else if (pin.priceAmount != null && pin.priceCurrency) {
    faqs.push({
      q: `How much does it cost to visit ${pin.name}?`,
      a: pin.priceAmount === 0
        ? `${pin.name} is free to visit.`
        : `Approximately ${pin.priceCurrency} ${pin.priceAmount} per person.`,
    });
  } else if (pin.free === true || pin.freeToVisit === true) {
    faqs.push({
      q: `Is ${pin.name} free to visit?`,
      a: `Yes — ${pin.name} is free to visit.`,
    });
  }

  if (pin.bookingRequired === true || pin.booking === 'required') {
    faqs.push({
      q: `Do you need to book in advance for ${pin.name}?`,
      a: 'Yes — advance booking is required.',
    });
  } else if (pin.booking === 'recommended') {
    faqs.push({
      q: `Do you need to book in advance for ${pin.name}?`,
      a: 'Booking in advance is recommended, especially during peak season.',
    });
  } else if (pin.booking === 'timed-entry-only') {
    faqs.push({
      q: `Do you need to book in advance for ${pin.name}?`,
      a: 'Yes — entry is by timed-ticket only and must be booked in advance.',
    });
  }

  if (pin.dressCode && pin.dressCode.trim().length > 0) {
    faqs.push({
      q: `Is there a dress code at ${pin.name}?`,
      a: pin.dressCode,
    });
  }

  if (pin.requiresGuide === 'required') {
    faqs.push({
      q: `Do you need a guide to visit ${pin.name}?`,
      a: 'Yes — a guide is required to enter.',
    });
  } else if (pin.requiresGuide === 'recommended') {
    faqs.push({
      q: `Do you need a guide to visit ${pin.name}?`,
      a: 'A guide is recommended for context but not required.',
    });
  }

  if (pin.wheelchairAccessible === 'fully') {
    faqs.push({
      q: `Is ${pin.name} wheelchair accessible?`,
      a: `Yes — ${pin.name} is fully wheelchair accessible.`,
    });
  } else if (pin.wheelchairAccessible === 'partially') {
    faqs.push({
      q: `Is ${pin.name} wheelchair accessible?`,
      a: 'Partially. Some areas are accessible; others are not.',
    });
  } else if (pin.wheelchairAccessible === 'no') {
    faqs.push({
      q: `Is ${pin.name} wheelchair accessible?`,
      a: 'No — the site is not wheelchair accessible.',
    });
  }

  if (pin.kidFriendly === true) {
    faqs.push({
      q: `Is ${pin.name} kid-friendly?`,
      a: `Yes — ${pin.name} is suitable for visiting with kids.`,
    });
  } else if (pin.kidFriendly === false) {
    faqs.push({
      q: `Is ${pin.name} kid-friendly?`,
      a: 'Not recommended for young children.',
    });
  }

  if (pin.durationMinutes != null && pin.durationMinutes > 0) {
    const hours = Math.floor(pin.durationMinutes / 60);
    const mins = pin.durationMinutes % 60;
    const dur =
      hours > 0
        ? mins > 0
          ? `${hours} hour${hours === 1 ? '' : 's'} and ${mins} minutes`
          : `${hours} hour${hours === 1 ? '' : 's'}`
        : `${mins} minutes`;
    faqs.push({
      q: `How long should you spend at ${pin.name}?`,
      a: `Plan for around ${dur}.`,
    });
  }

  if (faqs.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faqs`,
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}
