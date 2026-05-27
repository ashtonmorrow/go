// Opt-in "Pairs with" block. Frontmatter shape:
//   pairs_with:
//     intro: Optional editorial intro paragraph (omittable).
//     pairs:
//       - city: madrid
//         travel: 2 hr 30 by AVE
//         why: The Spanish counterpoint. Different food, different language register.
//
// Renders between the intro paragraph and the "On this page" TOC. Each pair
// is a chip-style button: the destination's country flag + the city name,
// linking to /lists/<slug>. Travel and why surface as a small caption row
// underneath so the chip itself stays compact.
//
// City -> country -> flag resolution happens server-side via fetchCityBySlug
// + fetchCountryById. Cached, so a 19-guide page with three pairs each
// pays for at most ~10 unique city lookups across the render.

import Image from 'next/image';
import Link from 'next/link';
import type { Pair, PairsWith } from '@/lib/content';
import { fetchCityBySlug, fetchCountryById } from '@/lib/places';

type ResolvedPair = Pair & {
  /** Canonical display name from go_cities, falls back to titlecased slug. */
  displayName: string;
  /** Country flag URL (flagcdn small). null when the city or country is
   *  missing from go_cities. */
  flagUrl: string | null;
  /** Country ISO2 for the alt text. */
  countryCode: string | null;
};

async function resolvePair(pair: Pair): Promise<ResolvedPair> {
  const city = await fetchCityBySlug(pair.city);
  if (!city) {
    return {
      ...pair,
      displayName: titlecase(pair.city),
      flagUrl: null,
      countryCode: null,
    };
  }
  const country = city.countryPageId ? await fetchCountryById(city.countryPageId) : null;
  const iso2 = country?.iso2?.toLowerCase() ?? null;
  // Force a small flag from flagcdn rather than reusing the curated full-size
  // URL on the country record. A 32px-wide flag at 2x density is the right
  // size for a chip and avoids loading a 640px-wide PNG just to display it
  // at 24px.
  const flagUrl = iso2 ? `https://flagcdn.com/w40/${iso2}.png` : null;
  return {
    ...pair,
    displayName: city.name,
    flagUrl,
    countryCode: country?.iso2 ?? null,
  };
}

function titlecase(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default async function PairsWithBlock({ data }: { data: PairsWith }) {
  const resolved = await Promise.all(data.pairs.map(resolvePair));

  return (
    <section id="pairs-with" className="mt-8 max-w-prose">
      <h2 className="text-h2 text-ink-deep">Pairs with</h2>
      {data.intro && (
        <p className="mt-3 text-prose leading-relaxed text-ink">{data.intro}</p>
      )}
      <ul className="mt-4 space-y-4">
        {resolved.map(p => (
          <li key={p.city}>
            <Link
              href={`/lists/${p.city}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-small font-medium text-ink-deep no-underline transition hover:border-ink-deep hover:bg-paper-warm"
            >
              {p.flagUrl ? (
                <Image
                  src={p.flagUrl}
                  alt={p.countryCode ? `${p.countryCode} flag` : ''}
                  width={20}
                  height={15}
                  className="h-auto w-5 shrink-0 rounded-sm"
                  unoptimized
                />
              ) : (
                <span aria-hidden className="inline-block w-5 text-center">·</span>
              )}
              <span>{p.displayName}</span>
            </Link>
            <p className="ml-1 mt-1 text-small text-slate leading-relaxed">
              <span className="text-ink">{p.travel}.</span>{' '}
              <span>{p.why}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
