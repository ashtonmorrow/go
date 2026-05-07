import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { fetchAllPins, type Pin } from './pins';
import { fetchPersonalCovers } from './personalPhotos';
import { fetchAllCountries } from './notion';

// === /pins/cards aggregator ================================================
// Pre-computes the slim Pin shape needed for the cockpit grid + filters
// and caches it at the lib layer. Why: the full Pin corpus is ~7.5 MB
// (5,000 pins × ~50 nullable rich fields), well over Next's 2 MB data
// cache ceiling, so unstable_cache silently rejects the cached value
// and every render hits Supabase fresh — exactly the 9 s TTFB pattern
// PSI flagged for /cities/cards (same architecture).
//
// The slim shape keeps every field PinsGrid + lib/pinFilter touch, drops
// the heavy detail-page-only fields (enrichment metadata, hoursDetails /
// priceDetails / admission JSONBs, hotel + restaurant rich fields,
// access notes, googleRating, etc.), and trims pin.images to just the
// first cover URL since cards only ever read [0].url. Total per-pin
// drops from ~1500 B to ~250 B → corpus shrinks under the 2 MB cap.
//
// PinsGrid + pinFilter accept this shape directly because TypeScript's
// structural typing means a Pick<Pin, …> argument satisfies a Pin
// parameter as long as every field they actually touch is present.

export type PinForCard = Pick<
  Pin,
  | 'id'
  | 'slug'
  | 'name'
  | 'kind'
  | 'category'
  | 'description'
  | 'cityNames'
  | 'statesNames'
  | 'visited'
  | 'visitYear'
  | 'personalRating'
  | 'personalReview'
  | 'hours'
  | 'priceAmount'
  | 'priceCurrency'
  | 'priceText'
  | 'priceTier'
  | 'free'
  | 'freeToVisit'
  | 'foodOnSite'
  | 'kidFriendly'
  | 'wheelchairAccessible'
  | 'inceptionYear'
  | 'bring'
  | 'unescoId'
  | 'unescoUrl'
  | 'lists'
  | 'savedLists'
  | 'tags'
  | 'inBlog'
  | 'images'
  | 'lat'
  | 'lng'
> & {
  personalCoverUrl: string | null;
};

const _fetchPinsCardData = unstable_cache(
  async (): Promise<{
    pins: PinForCard[];
    countryNameToIso2: Record<string, string>;
  }> => {
    const [pinsRaw, countries, personalCovers] = await Promise.all([
      fetchAllPins(),
      fetchAllCountries(),
      fetchPersonalCovers(),
    ]);

    const pins: PinForCard[] = pinsRaw.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      category: p.category,
      description: p.description,
      cityNames: p.cityNames,
      statesNames: p.statesNames,
      visited: p.visited,
      visitYear: p.visitYear,
      personalRating: p.personalRating,
      personalReview: p.personalReview,
      hours: p.hours,
      priceAmount: p.priceAmount,
      priceCurrency: p.priceCurrency,
      priceText: p.priceText,
      priceTier: p.priceTier,
      free: p.free,
      freeToVisit: p.freeToVisit,
      foodOnSite: p.foodOnSite,
      kidFriendly: p.kidFriendly,
      wheelchairAccessible: p.wheelchairAccessible,
      inceptionYear: p.inceptionYear,
      bring: p.bring,
      unescoId: p.unescoId,
      unescoUrl: p.unescoUrl,
      lists: p.lists,
      savedLists: p.savedLists,
      tags: p.tags,
      inBlog: p.inBlog,
      // Cards only ever read images[0].url. Keep just the first URL to
      // shave ~50% off the per-pin payload. Array shape preserved so
      // pinFilter's `images.length > 0` check still works.
      images: p.images.length > 0 ? [{ url: p.images[0].url }] : [],
      // Coords are dropped from the cards bundle; PinsMap fetches its
      // own lighter coords-only payload. (Set to null here so the type
      // stays Pin-compatible.)
      lat: null,
      lng: null,
      personalCoverUrl: personalCovers.get(p.id) ?? null,
    }));

    const countryNameToIso2: Record<string, string> = {};
    for (const c of countries) {
      if (c.iso2) countryNameToIso2[c.name.toLowerCase()] = c.iso2;
    }

    return { pins, countryNameToIso2 };
  },
  ['pins-card-data-v1'],
  {
    revalidate: 86400,
    tags: ['supabase-pins', 'supabase-countries'],
  },
);

export const fetchPinsCardData = cache(_fetchPinsCardData);
