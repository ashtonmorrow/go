/**
 * Pin cleanup and conservative augmentation.
 *
 * What it does:
 *   1. Merges a few exact/high-confidence duplicate pin pairs.
 *   2. Enriches Google Takeout pins through the existing Supabase
 *      location-lookup function.
 *   3. Normalizes city/country labels from addresses.
 *   4. Backfills concise factual descriptions and low-risk facets.
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/cleanup-augment-pins.ts
 *
 * Apply:
 *   npx tsx --env-file=.env.local scripts/cleanup-augment-pins.ts --apply
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[pins] Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : null;
const LOOKUP_CONCURRENCY = 6;
const UPDATE_CONCURRENCY = 10;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type PinRow = Record<string, any> & {
  id: string;
  name: string;
  slug: string | null;
  kind: string | null;
  category: string | null;
  source: string | null;
  visited: boolean | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  city_names: string[] | null;
  states_names: string[] | null;
  description: string | null;
  website: string | null;
  google_place_url: string | null;
  personal_rating: number | null;
  personal_review: string | null;
  visit_year: number | null;
};

type LookupPlace = {
  name: string;
  address: string;
  city: string;
  country: string;
  latLong: string;
  category: string;
  website: string;
  google_maps_url: string;
  estimated_rating: number | null;
  distance_meters: number | null;
};

const ALLOWED_KINDS = new Set(['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit']);
const NOW = () => new Date().toISOString();

function isEmpty(value: any): boolean {
  return (
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
  );
}

function normalizeText(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|restaurant|restaurante|cafe|café|hotel|hostel|inn|bar|grill|museum|museo|park|parque)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const A = new Set(normalizeText(a).split(' ').filter(t => t.length > 1));
  const B = new Set(normalizeText(b).split(' ').filter(t => t.length > 1));
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection++;
  return intersection / (A.size + B.size - intersection);
}

function containsName(a: string, b: string): boolean {
  const A = normalizeText(a);
  const B = normalizeText(b);
  return A.length > 4 && B.length > 4 && (A.includes(B) || B.includes(A));
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
}

function cleanCountry(country: string | null | undefined): string | null {
  const raw = String(country ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\.$/, '');
  const aliases: Record<string, string> = {
    USA: 'United States of America',
    'U.S.A': 'United States of America',
    'U.S.': 'United States of America',
    'United States': 'United States of America',
    UK: 'United Kingdom',
    'Viet Nam': 'Vietnam',
    UAE: 'United Arab Emirates',
  };
  return aliases[normalized] ?? normalized;
}

function cleanCity(city: string | null | undefined, country?: string | null): string | null {
  let s = String(city ?? '').trim();
  if (!s) return null;
  s = s
    .replace(/^\d{3}\s?\d{2}\s+/, '')
    .replace(/^\d{4,6}\s+/, '')
    .replace(/\s+\d{4,6}$/, '')
    .replace(/\b[A-Z]{1,3}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g, '')
    .replace(/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?$/g, '')
    .replace(/\b[A-Z]{2}$/g, '')
    .replace(/\b(Governorate|Province|County|District|Prefecture|Department|Region)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (country === 'Czechia' && /^Praha\b/i.test(s)) return 'Prague';
  if (country === 'Thailand' && /^Krung Thep Maha Nakhon\b/i.test(s)) return 'Bangkok';
  if (country === 'United Kingdom' && /\bLondon\b/i.test(s)) return 'London';
  if (country === 'United States of America' && /\bWashington\b/i.test(s) && /\bDC\b/i.test(s)) return 'Washington, DC';
  return s;
}

function locationFromAddress(address: string | null | undefined): { city: string | null; country: string | null } {
  if (!address) return { city: null, country: null };
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: null, country: null };
  const country = cleanCountry(parts[parts.length - 1]);
  let cityCandidate = parts[parts.length - 2];
  if (
    country === 'United States of America' ||
    country === 'Canada' ||
    /^[A-Z]{2}\s+\d/.test(cityCandidate)
  ) {
    cityCandidate = parts[parts.length - 3] ?? cityCandidate;
  }
  return { city: cleanCity(cityCandidate, country), country };
}

function locationFromLookup(place: LookupPlace | null): { city: string | null; country: string | null } {
  if (!place) return { city: null, country: null };
  const country = cleanCountry(place.country);
  const city = cleanCity(place.city, country) ?? locationFromAddress(place.address).city;
  return { city, country };
}

function categoryToKind(category: string | null | undefined, name: string, current: string | null): string | null {
  const categoryText = String(category ?? '').toLowerCase();
  const nameText = String(name ?? '').toLowerCase();
  const c = `${categoryText} ${nameText}`;
  if (/\b(hotel|lodging|resort|hostel|inn|motel|hyatt|marriott|sheraton|hilton|m[eé]ridien)\b/.test(c)) return 'hotel';
  if (/\b(restaurant|cafe|coffee|bar|bakery|meal|food|pizza|sushi|tacos|brasserie|bistro|pub)\b/.test(categoryText)) return 'restaurant';
  if (/\b(restaurant|restaurante|cafe|café|coffee|bakery|patisserie|pizza|pizzeria|sushi|tacos|taqueria|brasserie|bistro|pub|grill|diner|cantina|trattoria|osteria)\b/.test(nameText)) return 'restaurant';
  if (/\bbar\b/.test(nameText) && !/\b(old town of bar|bar,\s*montenegro)\b/.test(nameText)) return 'restaurant';
  if (/\b(airport|station|terminal|transit|metro|subway|rail|ferry)\b/.test(c)) return 'transit';
  if (/\b(park|garden|beach|trail|reserve|national park)\b/.test(c)) return 'park';
  if (/\b(store|shop|shopping|market|mall|pharmacy|supermarket)\b/.test(c)) return 'shopping';
  if (/\b(museum|tourist_attraction|tourist attraction|landmark|church|place_of_worship|point_of_interest|point of interest)\b/.test(categoryText)) return 'attraction';
  if (current && ALLOWED_KINDS.has(current)) return current;
  return 'attraction';
}

function placeType(row: PinRow, category?: string | null): string {
  const raw = String(category || row.category || row.kind || 'place')
    .replace(/_/g, ' ')
    .replace(/\bpoint of interest\b/i, 'place')
    .trim();
  const lower = raw.toLowerCase();
  if (lower === 'cafe') return 'cafe';
  if (lower === 'tourist attraction') return 'visitor attraction';
  if (lower === 'lodging') return 'hotel or lodging';
  return lower || 'place';
}

function locationPhrase(city: string | null, country: string | null): string {
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return '';
}

function makeDescription(row: PinRow, city: string | null, country: string | null, category?: string | null): string {
  const type = placeType(row, category);
  const loc = locationPhrase(city, country);
  const first = `${row.name} is a ${type}${loc ? ` in ${loc}` : ''}.`;
  if (row.visited && row.visit_year) {
    return `${first} It is recorded as a visited place from ${row.visit_year}.`;
  }
  if (row.visited) {
    return `${first} It is recorded as a visited place in the travel atlas.`;
  }
  if (String(row.source ?? '').includes('saved')) {
    return `${first} It is saved for future trip planning.`;
  }
  return `${first} It is kept as a travel planning pin.`;
}

function inferCuisine(row: PinRow): string[] | null {
  if (row.kind !== 'restaurant') return null;
  const s = `${row.name} ${row.category ?? ''} ${row.description ?? ''}`.toLowerCase();
  const matches: [RegExp, string][] = [
    [/\blebanese\b/, 'Lebanese'],
    [/\bitalian|ristorante|trattoria|osteria|pizzeria|pizza\b/, 'Italian'],
    [/\bjapanese|sushi|ramen|izakaya\b/, 'Japanese'],
    [/\bthai\b/, 'Thai'],
    [/\bindian\b/, 'Indian'],
    [/\bchinese|dimsum|dim sum\b/, 'Chinese'],
    [/\bvietnamese|pho\b/, 'Vietnamese'],
    [/\bkorean\b/, 'Korean'],
    [/\bmexican|taco|taqueria\b/, 'Mexican'],
    [/\bgeorgian\b/, 'Georgian'],
    [/\bgreek\b/, 'Greek'],
    [/\bturkish\b/, 'Turkish'],
    [/\bmoroccan\b/, 'Moroccan'],
    [/\bspanish|tapas\b/, 'Spanish'],
    [/\bseafood|oyster|fish\b/, 'Seafood'],
    [/\bsteak|grill|asado|parrilla|rodizio\b/, 'Steakhouse'],
    [/\bbbq|barbecue|barbeque\b/, 'Barbecue'],
    [/\bburger\b/, 'Burgers'],
    [/\bcafe|coffee|bakery|patisserie|café\b/, 'Cafe'],
    [/\bvegan|vegetarian\b/, 'Vegetarian'],
    [/\bmediterranean\b/, 'Mediterranean'],
  ];
  const cuisines = matches.filter(([re]) => re.test(s)).map(([, label]) => label);
  return cuisines.length ? [...new Set(cuisines)] : null;
}

function inferHotelVibe(row: PinRow): string[] | null {
  if (row.kind !== 'hotel') return null;
  const s = `${row.name} ${row.address ?? ''}`.toLowerCase();
  const out: string[] = [];
  if (/\bairport|terminal|aeropuerto|ezeiza|suvarnabhumi\b/.test(s)) out.push('airport');
  if (/\bresort|beach|seaside|playa\b/.test(s)) out.push('resort');
  if (/\bconvention|conference|business|downtown|city centre|city center\b/.test(s)) out.push('business');
  if (/\bboutique|riad|design\b/.test(s)) out.push('boutique');
  if (/\bapartment|apart|suite|residence\b/.test(s)) out.push('apartment-style');
  return out.length ? out : null;
}

function inferPractical(row: PinRow): Record<string, any> {
  const patch: Record<string, any> = {};
  const s = `${row.name} ${row.category ?? ''} ${row.kind ?? ''}`.toLowerCase();
  if (row.kind === 'transit') {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'mixed';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = 30;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning'];
    return patch;
  }
  if (row.kind !== 'attraction' && row.kind !== 'park') return patch;

  if (/\b(national park|park|garden|beach|trail|mountain|canyon|lake|waterfall|reserve|forest)\b/.test(s)) {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'outdoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = /\bnational park\b/.test(s) ? 240 : 120;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning'];
    return patch;
  }
  if (/\b(museum|gallery|library|church|cathedral|palace|opera|theatre|theater|temple|mosque|synagogue|market|mall)\b/.test(s)) {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = /\bmarket|temple|palace\b/.test(s) ? 'mixed' : 'indoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = /\bmuseum|palace|temple\b/.test(s) ? 90 : 60;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning', 'afternoon'];
    return patch;
  }
  if (/\b(castle|citadel|fortress|ruins|archaeological|monument|bridge|square|tower|viewpoint|gate)\b/.test(s)) {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'outdoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = /\bcastle|citadel|fortress|ruins|archaeological\b/.test(s) ? 90 : 45;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = /\bviewpoint|tower\b/.test(s) ? ['sunset'] : ['morning'];
    return patch;
  }
  if (row.kind === 'park') {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'outdoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = 120;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning'];
  }
  return patch;
}

function mergeArrays(a: any, b: any): string[] {
  const list = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean).map(String);
  return [...new Set(list)];
}

async function fetchAllPins(): Promise<PinRow[]> {
  const out: PinRow[] = [];
  const columns = [
    'id', 'name', 'slug', 'kind', 'category', 'source', 'visited', 'lat', 'lng',
    'address', 'city_names', 'states_names', 'description', 'website',
    'google_place_url', 'personal_rating', 'personal_review', 'visit_year',
    'opening_hours', 'price_details', 'cuisine', 'price_tier', 'nights_stayed',
    'would_stay_again', 'hotel_vibe', 'duration_minutes', 'best_time_of_day',
    'indoor_outdoor', 'enrichment_status', 'enrichment_notes', 'lists', 'tags',
    'wikidata_qid', 'wikipedia_url', 'unesco_id', 'phone',
  ].join(',');
  for (let start = 0; ; start += 1000) {
    const { data, error } = await sb.from('pins').select(columns).range(start, start + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as unknown as PinRow[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function mergeDuplicatePins(apply: boolean): Promise<{ merged: string[]; deleted: string[] }> {
  const pairs = [
    {
      keep: 'central-sector-of-the-imperial-citadel-of-thang-long',
      remove: 'central-sector-of-the-imperial-citadel-of-thang-long-hanoi',
    },
    {
      keep: 'prambanan',
      remove: 'prambanan-temple-compounds',
    },
  ];
  const merged: string[] = [];
  const deleted: string[] = [];
  for (const pair of pairs) {
    const { data, error } = await sb.from('pins').select('*').in('slug', [pair.keep, pair.remove]);
    if (error) throw error;
    const keep = data?.find(row => row.slug === pair.keep);
    const remove = data?.find(row => row.slug === pair.remove);
    if (!keep || !remove) continue;

    const patch: Record<string, any> = {
      updated_at: NOW(),
      category: keep.category ?? remove.category,
      description: keep.description ?? remove.description,
      kind: keep.kind ?? remove.kind,
      city_names: mergeArrays(keep.city_names, remove.city_names),
      states_names: mergeArrays(keep.states_names, remove.states_names),
      lists: mergeArrays(keep.lists, remove.lists),
      tags: mergeArrays(keep.tags, remove.tags),
      wikidata_qid: keep.wikidata_qid ?? remove.wikidata_qid,
      wikipedia_url: keep.wikipedia_url ?? remove.wikipedia_url,
      unesco_id: keep.unesco_id ?? remove.unesco_id,
      website: keep.website ?? remove.website,
      google_place_url: keep.google_place_url ?? remove.google_place_url,
    };
    if (!apply) {
      merged.push(`${pair.keep} <= ${pair.remove}`);
      deleted.push(pair.remove);
      continue;
    }
    const { error: updateError } = await sb.from('pins').update(patch).eq('id', keep.id);
    if (updateError) throw updateError;
    const { error: photoError } = await sb.from('personal_photos').update({ pin_id: keep.id }).eq('pin_id', remove.id);
    if (photoError) throw photoError;
    const { error: deleteError } = await sb.from('pins').delete().eq('id', remove.id);
    if (deleteError) throw deleteError;
    merged.push(`${pair.keep} <= ${pair.remove}`);
    deleted.push(pair.remove);
  }
  return { merged, deleted };
}

async function lookupPin(pin: PinRow): Promise<{ pin: PinRow; place: LookupPlace | null; confidence: 'high' | 'medium' | 'none' }> {
  if (pin.lat == null || pin.lng == null) return { pin, place: null, confidence: 'none' };
  const { data, error } = await sb.functions.invoke('location-lookup', {
    body: { lat: pin.lat, lng: pin.lng, query: pin.name },
  });
  if (error) return { pin, place: null, confidence: 'none' };
  const matches = ((data as any)?.matches ?? []) as LookupPlace[];
  let best: { place: LookupPlace; score: number; confidence: 'high' | 'medium' } | null = null;
  for (const place of matches) {
    const [latS, lngS] = String(place.latLong ?? '').split(',').map(s => s.trim());
    const pLat = Number(latS);
    const pLng = Number(lngS);
    const distance = Number.isFinite(place.distance_meters)
      ? Number(place.distance_meters)
      : Number.isFinite(pLat) && Number.isFinite(pLng)
      ? haversineMeters(pin.lat, pin.lng, pLat, pLng)
      : 99999;
    const similarity = tokenSimilarity(pin.name, place.name);
    const contains = containsName(pin.name, place.name);
    const high = distance <= 50 && (similarity >= 0.48 || contains || distance <= 12);
    const medium = !high && distance <= 120 && (similarity >= 0.62 || contains);
    if (!high && !medium) continue;
    const score = (high ? 1000 : 500) - distance + similarity * 100;
    if (!best || score > best.score) {
      best = { place, score, confidence: high ? 'high' : 'medium' };
    }
  }
  return { pin, place: best?.place ?? null, confidence: best?.confidence ?? 'none' };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function needsLookup(pin: PinRow): boolean {
  const source = String(pin.source ?? '');
  if (!source.startsWith('google-takeout') && source !== 'airtable') return false;
  if (pin.lat == null || pin.lng == null) return false;
  return (
    isEmpty(pin.website) ||
    isEmpty(pin.description) ||
    isEmpty(pin.city_names) ||
    isEmpty(pin.states_names) ||
    isEmpty(pin.category) ||
    isEmpty(pin.google_place_url)
  );
}

function patchFromLookup(pin: PinRow, place: LookupPlace | null, confidence: string): Record<string, any> {
  const patch: Record<string, any> = {};
  const lookupLocation = locationFromLookup(place);
  const addressLocation = locationFromAddress(pin.address ?? place?.address);
  const city = lookupLocation.city ?? addressLocation.city;
  const country = lookupLocation.country ?? addressLocation.country;
  const category = place?.category || pin.category;
  const kind = categoryToKind(category, pin.name, pin.kind);

  if (place?.address && isEmpty(pin.address)) patch.address = place.address;
  if (place?.website && isEmpty(pin.website)) patch.website = place.website;
  if (place?.google_maps_url && isEmpty(pin.google_place_url)) patch.google_place_url = place.google_maps_url;
  if (category && isEmpty(pin.category)) patch.category = category;
  if (kind && pin.kind !== kind) patch.kind = kind;
  if (city && (isEmpty(pin.city_names) || hasMessyLocation(pin.city_names))) patch.city_names = [city];
  if (country && (isEmpty(pin.states_names) || hasMessyLocation(pin.states_names))) patch.states_names = [country];
  if (isEmpty(pin.description)) {
    patch.description = makeDescription({ ...pin, kind: kind ?? pin.kind, category }, city, country, category);
  }
  if (place) {
    patch.enrichment_status = 'enriched';
    patch.enrichment_source_type = 'google-location-lookup';
    patch.enrichment_confidence = confidence;
    patch.enrichment_checked_at = NOW();
    patch.enriched_at = NOW();
  }
  return patch;
}

function hasMessyLocation(value: any): boolean {
  const list = Array.isArray(value) ? value : [value];
  return list.some(v => {
    const s = String(v ?? '');
    return /\d{4,}/.test(s) || /\d{3}\s?\d{2}/.test(s) || /\b[A-Z]{1,3}\d[A-Z\d]?\s*\d[A-Z]{2}\b/.test(s) || /\bProvince of\b/i.test(s);
  });
}

function descriptionHasMessyLocation(description: string): boolean {
  return (
    /\d{3}\s?\d{2}\s+[A-ZÀ-ÿ]/.test(description) ||
    /\b[A-Z]{1,3}\d[A-Z\d]?\s*\d[A-Z]{2}\b/.test(description) ||
    /\bKrung Thep Maha Nakhon\b/.test(description) ||
    /\bProvince of\b/i.test(description)
  );
}

function derivedPatch(pin: PinRow): Record<string, any> {
  const patch: Record<string, any> = {};
  const inferredKind = categoryToKind(pin.category, pin.name, pin.kind);
  if (
    inferredKind &&
    pin.kind !== inferredKind &&
    String(pin.source ?? '').startsWith('google-takeout')
  ) {
    patch.kind = inferredKind;
  }
  const { city, country } = locationFromAddress(pin.address);
  if (city && (isEmpty(pin.city_names) || hasMessyLocation(pin.city_names))) patch.city_names = [city];
  if (country && (isEmpty(pin.states_names) || hasMessyLocation(pin.states_names))) patch.states_names = [country];
  const effectiveCity = (patch.city_names?.[0] ?? (Array.isArray(pin.city_names) ? pin.city_names[0] : null)) || city;
  const effectiveCountry = (patch.states_names?.[0] ?? (Array.isArray(pin.states_names) ? pin.states_names[0] : null)) || country;
  const generatedDescriptionNeedsRefresh =
    typeof pin.description === 'string' &&
    pin.description.startsWith(`${pin.name} is `) &&
    (descriptionHasMessyLocation(pin.description) || Boolean(patch.city_names) || Boolean(patch.states_names));
  if (isEmpty(pin.description) || generatedDescriptionNeedsRefresh) {
    patch.description = makeDescription(pin, effectiveCity, effectiveCountry, pin.category);
  }

  const cuisine = inferCuisine({ ...pin, ...patch });
  if (cuisine && isEmpty(pin.cuisine)) patch.cuisine = cuisine;

  const hotelVibe = inferHotelVibe({ ...pin, ...patch });
  if (hotelVibe && isEmpty(pin.hotel_vibe)) patch.hotel_vibe = hotelVibe;

  const practical = inferPractical({ ...pin, ...patch });
  Object.assign(patch, practical);

  return patch;
}

function compactPatch(patch: Record<string, any>, existing: PinRow): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const before = existing[key];
    if (JSON.stringify(before ?? null) !== JSON.stringify(value ?? null)) {
      out[key] = value;
    }
  }
  if (Object.keys(out).length) out.updated_at = NOW();
  return out;
}

async function applyUpdates(updates: Array<{ id: string; patch: Record<string, any>; name: string }>): Promise<number> {
  if (!APPLY) return updates.length;
  let done = 0;
  await mapConcurrent(updates, UPDATE_CONCURRENCY, async update => {
    const { error } = await sb.from('pins').update(update.patch).eq('id', update.id);
    if (error) throw new Error(`[pins] update failed for ${update.name}: ${error.message}`);
    done++;
    if (done % 100 === 0) console.log(`[pins] updated ${done}/${updates.length}`);
  });
  return done;
}

async function main() {
  console.log(`[pins] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const duplicates = await mergeDuplicatePins(APPLY);
  console.log(`[pins] duplicate pairs merged: ${duplicates.merged.length}`);
  if (duplicates.merged.length) {
    for (const item of duplicates.merged) console.log(`  ${item}`);
  }

  const pins = await fetchAllPins();
  const lookupTargets = pins.filter(needsLookup).slice(0, LIMIT ?? undefined);
  console.log(`[pins] lookup targets: ${lookupTargets.length}`);
  const lookupResults = await mapConcurrent(lookupTargets, LOOKUP_CONCURRENCY, async (pin, index) => {
    const result = await lookupPin(pin);
    if ((index + 1) % 100 === 0) console.log(`[pins] looked up ${index + 1}/${lookupTargets.length}`);
    return result;
  });

  const lookupPatches = new Map<string, Record<string, any>>();
  let high = 0;
  let medium = 0;
  for (const result of lookupResults) {
    if (result.confidence === 'high') high++;
    if (result.confidence === 'medium') medium++;
    const patch = patchFromLookup(result.pin, result.place, result.confidence);
    const compact = compactPatch(patch, result.pin);
    if (Object.keys(compact).length) lookupPatches.set(result.pin.id, compact);
  }
  console.log(`[pins] lookup matches: ${high} high, ${medium} medium`);

  const latestPins = await fetchAllPins();
  const allPatches = new Map<string, { id: string; name: string; patch: Record<string, any> }>();
  for (const pin of latestPins) {
    const lookupPatch = lookupPatches.get(pin.id) ?? {};
    const withLookup = { ...pin, ...lookupPatch };
    const patch = compactPatch({ ...lookupPatch, ...derivedPatch(withLookup as PinRow) }, pin);
    if (Object.keys(patch).length) {
      allPatches.set(pin.id, { id: pin.id, name: pin.name, patch });
    }
  }

  const updates = [...allPatches.values()];
  const fieldCounts: Record<string, number> = {};
  for (const update of updates) {
    for (const key of Object.keys(update.patch)) {
      if (key === 'updated_at') continue;
      fieldCounts[key] = (fieldCounts[key] ?? 0) + 1;
    }
  }
  console.log(`[pins] rows to update: ${updates.length}`);
  console.log(`[pins] fields: ${JSON.stringify(fieldCounts, null, 2)}`);
  const updated = await applyUpdates(updates);
  console.log(`[pins] ${APPLY ? 'updated' : 'would update'} ${updated} rows.`);
}

main().catch(error => {
  console.error('[pins] FATAL:', error);
  process.exit(1);
});
