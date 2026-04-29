import 'server-only';
import { supabaseAdmin } from './supabaseAdmin';

const EARTH_RADIUS_KM = 6371;

export type CandidatePlace = {
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  category: string;
  website: string;
  googleMapsUrl: string;
  estimatedRating: number | null;
  distanceMeters: number | null;
};

export type Candidate = {
  /** Stable client-side id (combines lat/lng/name). */
  id: string;
  place: CandidatePlace;
  /** Photo hashes from the input batch that fall near this candidate. */
  photoHashes: string[];
  /** If a pin already exists within 100m of this place, this is its id. */
  existingPinId: string | null;
  existingPinName: string | null;
  existingPinSlug: string | null;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function candidateId(name: string, lat: number, lng: number): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${lat.toFixed(5)}-${lng.toFixed(5)}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function nearbyPlacesFor(
  lat: number,
  lng: number,
  query?: string | null,
): Promise<CandidatePlace[]> {
  const sb = supabaseAdmin();
  const body: Record<string, unknown> = { lat, lng };
  if (query) body.query = query;
  const { data, error } = await sb.functions.invoke('location-lookup', { body });
  if (error) {
    console.error('[findOrCreatePin] location-lookup failed:', error);
    return [];
  }
  const matches = (data as any)?.matches ?? [];
  return matches.map((m: any) => {
    const [latStr, lngStr] = String(m.latLong || '').split(',').map((s: string) => s.trim());
    const pLat = Number.parseFloat(latStr);
    const pLng = Number.parseFloat(lngStr);
    return {
      name: m.name ?? 'Unknown',
      address: m.address ?? '',
      city: m.city ?? '',
      country: m.country ?? '',
      lat: Number.isFinite(pLat) ? pLat : lat,
      lng: Number.isFinite(pLng) ? pLng : lng,
      category: m.category ?? 'venue',
      website: m.website ?? '',
      googleMapsUrl: m.google_maps_url ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      estimatedRating: typeof m.estimated_rating === 'number' ? m.estimated_rating : null,
      distanceMeters: typeof m.distance_meters === 'number' ? m.distance_meters : null,
    } as CandidatePlace;
  });
}

/**
 * For a batch of (hash, lat, lng) triples, fetch nearby Google Places per
 * point, dedupe candidates across photos, and check existing pins within
 * 100m of each candidate so we don't propose duplicates.
 */
export async function findCandidatesForPhotos(
  photos: Array<{ hash: string; lat: number; lng: number; query?: string | null }>,
): Promise<Candidate[]> {
  if (!photos.length) return [];

  const allPlaces: Array<{ place: CandidatePlace; photoHash: string }> = [];
  await Promise.all(
    photos.map(async p => {
      const places = await nearbyPlacesFor(p.lat, p.lng, p.query ?? null);
      for (const place of places) {
        allPlaces.push({ place, photoHash: p.hash });
      }
    }),
  );

  const grouped = new Map<string, Candidate>();
  for (const { place, photoHash } of allPlaces) {
    const id = candidateId(place.name, place.lat, place.lng);
    let entry = grouped.get(id);
    if (!entry) {
      entry = {
        id,
        place,
        photoHashes: [],
        existingPinId: null,
        existingPinName: null,
        existingPinSlug: null,
      };
      grouped.set(id, entry);
    }
    if (!entry.photoHashes.includes(photoHash)) {
      entry.photoHashes.push(photoHash);
    }
  }

  if (grouped.size === 0) return [];

  const sb = supabaseAdmin();
  const PAGE_SIZE = 1000;
  const existingPins: Array<{ id: string; name: string; slug: string | null; lat: number; lng: number }> = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await sb
      .from('pins')
      .select('id, name, slug, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(start, start + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    for (const p of data) {
      if (typeof p.lat === 'number' && typeof p.lng === 'number') {
        existingPins.push({ id: p.id, name: p.name, slug: p.slug ?? null, lat: p.lat, lng: p.lng });
      }
    }
    if (data.length < PAGE_SIZE) break;
  }

  const candidates = [...grouped.values()];
  for (const c of candidates) {
    let bestMatch: { id: string; name: string; slug: string | null; dist: number } | null = null;
    for (const p of existingPins) {
      const dist = haversineKm(c.place.lat, c.place.lng, p.lat, p.lng);
      if (dist < 0.1 && (!bestMatch || dist < bestMatch.dist)) {
        bestMatch = { id: p.id, name: p.name, slug: p.slug, dist };
      }
    }
    if (bestMatch) {
      c.existingPinId = bestMatch.id;
      c.existingPinName = bestMatch.name;
      c.existingPinSlug = bestMatch.slug;
    }
  }

  candidates.sort((a, b) => {
    if (b.photoHashes.length !== a.photoHashes.length) {
      return b.photoHashes.length - a.photoHashes.length;
    }
    return a.place.name.localeCompare(b.place.name);
  });

  return candidates;
}

/**
 * Create a new pin from a candidate. Returns the new row.
 * Uses server-side service-role client (bypasses RLS).
 */
export async function createPinFromCandidate(
  c: CandidatePlace,
): Promise<{ id: string; slug: string } | null> {
  const sb = supabaseAdmin();
  const slugBase = slugify(c.name);
  let slug = slugBase;

  for (let i = 0; i < 5; i++) {
    const { data: existing } = await sb
      .from('pins')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data, error } = await sb
    .from('pins')
    .insert({
      name: c.name,
      slug,
      lat: c.lat,
      lng: c.lng,
      address: c.address || null,
      category: c.category || 'venue',
      website: c.website || null,
      city_names: c.city ? [c.city] : [],
      states_names: c.country ? [c.country] : [],
      visited: true,
    })
    .select('id, slug')
    .single();

  if (error || !data) {
    console.error('[findOrCreatePin] createPinFromCandidate failed:', error);
    return null;
  }
  return { id: data.id, slug: data.slug };
}
