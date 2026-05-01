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
 *
 * Offline only, with no external lookup calls:
 *   npx tsx --env-file=.env.local scripts/cleanup-augment-pins.ts --offline --apply
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[pins] Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');
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
  saved_lists: string[] | null;
};

type CityRow = {
  name: string | null;
  country: string | null;
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

function locationKey(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[_/,+-]+/g, ' ')
    .replace(/\b(food|foods|sites|site|all|overall|misc|unexplored|metro|stops|station|stations|route|routes|close|cheap|day|places|visit|want|go|destinos|coche|parks|trails|castles|bucket|list|default)\b/g, ' ')
    .replace(/\b(uk|fr|nl|es|ar|sc|ny)\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
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

function articleFor(type: string): 'a' | 'an' {
  if (/^(attraction|aquarium|airport|opera|inn|exhibition)\b/i.test(type)) return 'an';
  return 'a';
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

function categoryToKind(category: string | null | undefined, name: string, current: string | null, defaultToAttraction = true): string | null {
  const fold = (value: string | null | undefined) =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const categoryText = fold(category);
  const nameText = fold(name);
  const c = `${categoryText} ${nameText}`;
  if (/\b([a-z]*hotel|lodging|resort|hostel|inn|motel|guest ?house|guesthouse|lodge|aparthotel|suites|riad|bujtina|hyatt|marriott|sheraton|hilton|conrad|waldorf|courtyard|fairfield|moxy|ritz[- ]?carlton|andaz|westin|kimpton|intercontinental|holiday inn|crowne plaza|radisson|wyndham|ramada|best western|four seasons|mandarin oriental|peninsula|kempinski|sofitel|novotel|mercure|ibis|pullman|accor|melia|barcelo|riu|fairmont|raffles|swissotel|movenpick|jumeirah|rosewood|edition|hoxton|citizenm|premier inn|travelodge|meridien)\b/.test(c)) return 'hotel';
  if (/\b(restaurant|restaurante|cafe|caffe|coffee|coffe|bar|bakery|meal|food|pizza|sushi|tacos|brasserie|bistro|pub|brewery|taproom|grill|diner|noodle|ramen|pasta|steakhouse|takeaway|take away)\b/.test(categoryText)) return 'restaurant';
  if (/\b(restaurant|restaurante|ristorante|restoran|cafe|caffe|coffee|coffe|bakery|bake|beigel|boulangerie|patisserie|patiseria|pasteleria|panaderia|pasteis|nata|pizza|pizzeria|sushi|maki|ramen|noodle|dosa|donburi|teishoku|kebab|bao|kitchen|cocina|cucina|krua|tacos|taqueria|brasserie|bistro|pub|tavern|brewery|brewing|bierwerk|cerveceria|cerveza|taproom|grill|diner|cantina|konoba|trattoria|osteria|ostreria|parrilla|asado|bbq|barbecue|burger|falafel|shawarma|empanada|burrito|gelato|ice cream|rooftop|cocktail|wine bar|steakhouse|seafood|tuna|takeaway|take away|pita)\b|burger/.test(nameText)) return 'restaurant';
  if (/\bbar\b/.test(nameText) && !/\b(old town of bar|bar,\s*montenegro)\b/.test(nameText)) return 'restaurant';
  if (/\b(airport|station|terminal|transit|metro|subway|rail|ferry)\b/.test(c)) return 'transit';
  if (/\b(park|garden|gardens|botanical|beach|trail|reserve|national park|waterfall|lido)\b/.test(c)) return 'park';
  if (/\b(store|shop|shopping|market|mercado|bazaar|mall|markthal|pharmacy|supermarket|boutique|tailor|barber)\b/.test(c)) return 'shopping';
  if (/\b(museum|gallery|tourist_attraction|tourist attraction|landmark|church|cathedral|mosque|temple|synagogue|wat|ossuary|monasterio|place_of_worship|point_of_interest|point of interest|castle|fortress|tower|aquarium|zoo|spa|thermal baths|lagoon|theme park|waterbom|windmill|college|viking centre|viking center|plaza|square|skyspace|plopsaland|terra mitica)\b/.test(c)) return 'attraction';
  if (current && ALLOWED_KINDS.has(current)) return current;
  return defaultToAttraction ? 'attraction' : null;
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
  const first = `${row.name} is ${articleFor(type)} ${type}${loc ? ` in ${loc}` : ''}.`;
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
  const s = `${row.name} ${row.category ?? ''} ${row.description ?? ''}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const matches: [RegExp, string][] = [
    [/\blebanese\b/, 'Lebanese'],
    [/\bitalian|italia|ristorante|trattoria|osteria|ostreria|pizzeria|pizza|cucina|sapori|pasteis|nata\b/, 'Italian'],
    [/\bjapanese|sushi|ramen|izakaya|donburi|teishoku|ippudo\b/, 'Japanese'],
    [/\bthai|krua\b/, 'Thai'],
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
    [/\bcafe|coffee|coffe|bakery|patisserie|café\b/, 'Cafe'],
    [/\bvegan|vegetarian\b/, 'Vegetarian'],
    [/\bmediterranean\b/, 'Mediterranean'],
    [/\bbar|pub|tavern|lounge|cocktail|brewery|brewing|cerveceria|cerveza|bierwerk|beer|wine\b/, 'Bar'],
    [/\bbakery|boulangerie|patisserie|patiseria|pasteleria|panaderia|pasteis|nata\b/, 'Bakery'],
    [/\bice cream|gelato|chocolate|dessert|sweet\b/, 'Dessert'],
    [/\bfast food|takeaway|takeout\b/, 'Fast food'],
    [/\bfood court|food hall\b/, 'Food hall'],
  ];
  const cuisines = matches.filter(([re]) => re.test(s)).map(([, label]) => label);
  return cuisines.length ? [...new Set(cuisines)] : null;
}

function inferMealTypes(row: PinRow): string[] | null {
  if (row.kind !== 'restaurant') return null;
  const s = `${row.name} ${row.category ?? ''} ${row.description ?? ''}`.toLowerCase();
  if (/\bbar|pub|tavern|lounge|cocktail|brewery|brewing|cerveceria|cerveza|beer|wine\b/.test(s)) return ['drinks'];
  if (/\bcoffee|coffe|cafe|café|caffe|bakery|boulangerie|patisserie|pâtisserie|patiseria|pasteleria|panaderia|pasteis|nata|breakfast|brunch\b/.test(s)) {
    return ['breakfast', 'lunch'];
  }
  if (/\bice cream|gelato|chocolate|dessert|sweet\b/.test(s)) return ['snack'];
  if (/\bfood court|food hall|market\b/.test(s)) return ['lunch', 'dinner'];
  return ['lunch', 'dinner'];
}

function inferDietaryOptions(row: PinRow): string[] | null {
  if (row.kind !== 'restaurant') return null;
  const s = `${row.name} ${row.category ?? ''} ${row.description ?? ''} ${row.personal_review ?? ''}`.toLowerCase();
  const out: string[] = [];
  if (/\bhalal\b/.test(s)) out.push('Halal');
  if (/\bvegan\b/.test(s)) out.push('Vegan');
  if (/\bvegetarian\b/.test(s)) out.push('Vegetarian');
  if (/\bgluten[- ]free\b/.test(s)) out.push('Gluten-free');
  return out.length ? out : null;
}

function inferPriceTier(row: PinRow): '$' | '$$' | '$$$' | '$$$$' | null {
  if (row.kind !== 'restaurant') return null;
  const text = `${row.price_text ?? ''} ${row.name ?? ''} ${row.category ?? ''} ${row.description ?? ''}`.toLowerCase();
  const amount = typeof row.price_amount === 'number' ? row.price_amount : null;
  if (/\${4}/.test(text) || /\b(tasting menu|fine dining|michelin|luxury)\b/.test(text)) return '$$$$';
  if (/\${3}/.test(text) || /\b(expensive|upscale)\b/.test(text)) return '$$$';
  if (/\${2}/.test(text) || /\b(moderate|mid[- ]range)\b/.test(text)) return '$$';
  if (/\${1}/.test(text) || /\b(cheap|inexpensive|budget|fast food|street food|coffee|coffe|bakery|cafe|café|caffe|kebab|falafel|pita|pasteis|nata)\b/.test(text)) return '$';
  if (amount != null) {
    if (amount <= 15) return '$';
    if (amount <= 35) return '$$';
    if (amount <= 75) return '$$$';
    return '$$$$';
  }
  if (/\b(bar|pub|tavern|lounge|coffee|coffe|cafe|café|caffe|bakery|ice cream|gelato|food court|fast food|kebab|falafel)\b/.test(text)) return '$';
  return null;
}

function inferHotelVibe(row: PinRow): string[] | null {
  if (row.kind !== 'hotel') return null;
  const s = `${row.name} ${row.address ?? ''} ${row.description ?? ''}`.toLowerCase();
  const out: string[] = [];
  if (/\bairport|terminal|aeropuerto|ezeiza|suvarnabhumi\b/.test(s)) out.push('airport');
  if (/\bresort|beach|seaside|playa\b/.test(s)) out.push('resort');
  if (/\bconvention|conference|business|downtown|city centre|city center\b/.test(s)) out.push('business');
  if (/\bboutique|riad|design\b/.test(s)) out.push('boutique');
  if (/\bapartment|apart|suite|residence\b/.test(s)) out.push('apartment-style');
  if (/\b(?:hyatt|marriott|sheraton|hilton|ihg|holiday inn|accor|novotel|ibis|moxy|aloft|melia|meliá|nh hotel|ac hotel|le m[eé]ridien|four points|courtyard|fairfield|westin|ritz[- ]?carlton|st\.? regis|radisson|best western)\b/.test(s)) out.push('chain');
  if (/\bhostel|motel|budget|ibis|holiday inn express|moxy|aloft|travelodge|premier inn\b/.test(s)) out.push('budget');
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

  if (/\b(national park|park|garden|beach|trail|mountain|canyon|lake|waterfall|reserve|forest|botanical|zoo)\b/.test(s)) {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'outdoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = /\bnational park\b/.test(s) ? 240 : 120;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning', 'sunset'];
    return patch;
  }
  if (/\b(museum|gallery|library|church|cathedral|palace|opera|theatre|theater|temple|mosque|synagogue|market|mall|aquarium|exhibition|cultural center|arts centre|arts center)\b/.test(s)) {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = /\bmarket|temple|palace\b/.test(s) ? 'mixed' : 'indoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = /\bmuseum|palace|temple\b/.test(s) ? 90 : 60;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning', 'afternoon'];
    return patch;
  }
  if (/\b(castle|citadel|fortress|ruins|archaeological|monument|memorial|bridge|square|plaza|tower|viewpoint|gate|old town|historic|wall|fort|harbor|harbour|pier)\b/.test(s)) {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'outdoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = /\bcastle|citadel|fortress|ruins|archaeological\b/.test(s) ? 90 : 45;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = /\bviewpoint|tower\b/.test(s) ? ['sunset'] : ['morning'];
    return patch;
  }
  if (row.kind === 'park') {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'outdoor';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = 120;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning'];
    return patch;
  }
  if (row.kind === 'attraction') {
    if (isEmpty(row.indoor_outdoor)) patch.indoor_outdoor = 'mixed';
    if (isEmpty(row.duration_minutes)) patch.duration_minutes = 60;
    if (isEmpty(row.best_time_of_day)) patch.best_time_of_day = ['morning', 'afternoon'];
  }
  return patch;
}

function inferFoodOnSite(row: PinRow): string | null {
  const s = `${row.name} ${row.category ?? ''} ${row.kind ?? ''}`.toLowerCase();
  if (row.kind === 'restaurant') {
    if (/\b(cafe|café|coffee|coffe|bakery|patisserie)\b/.test(s)) return 'cafe';
    return 'restaurant';
  }
  if (row.kind === 'hotel') return 'restaurant';
  if (/\b(food hall|food court|market|mall|shopping center|shopping centre)\b/.test(s)) return 'multiple';
  if (/\b(museum|gallery|aquarium|zoo)\b/.test(s)) return 'cafe';
  return null;
}

function inferFreeToVisit(row: PinRow): boolean | null {
  const s = `${row.name} ${row.category ?? ''} ${row.price_text ?? ''} ${row.description ?? ''}`.toLowerCase();
  if (row.free === true) return true;
  if (typeof row.price_amount === 'number' && row.price_amount === 0) return true;
  if (/\bfree\b/.test(s) && !/\bnot free\b/.test(s)) return true;
  if (row.kind === 'shopping') return true;
  if (row.kind === 'attraction' || row.kind === 'park') {
    if (/\b(public park|city park|square|plaza|bridge|street|neighborhood|neighbourhood|viewpoint|beach|memorial|monument|old town|historic district|waterfront|harbor|harbour|pier)\b/.test(s)) {
      return true;
    }
  }
  return null;
}

function fallbackGoogleMapsUrl(row: PinRow): string | null {
  if (row.lat == null || row.lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`;
}

type LocationHint = {
  cityNames: string[];
  country: string | null;
};

const SAVED_LIST_LOCATION_HINTS: Record<string, LocationHint> = {
  'aegina': { cityNames: ['Aegina'], country: 'Greece' },
  'aia': { cityNames: ['The Hague'], country: 'Netherlands' },
  'alicante metro stops': { cityNames: ['Alicante'], country: 'Spain' },
  'bar montenegro': { cityNames: ['Bar'], country: 'Montenegro' },
  'bath uk': { cityNames: ['Bath'], country: 'England' },
  'belgian coast': { cityNames: [], country: 'Belgium' },
  'belgian coastal town stops': { cityNames: [], country: 'Belgium' },
  'belluno caviola': { cityNames: ['Belluno'], country: 'Italy' },
  'brittany': { cityNames: [], country: 'France' },
  'bruges 1': { cityNames: ['Bruges'], country: 'Belgium' },
  'delft': { cityNames: ['Delft'], country: 'Netherlands' },
  'cdmx': { cityNames: ['Mexico City'], country: 'Mexico' },
  'cordoba ar food': { cityNames: ['Córdoba'], country: 'Argentina' },
  'croatia non city': { cityNames: [], country: 'Croatia' },
  'den haag': { cityNames: ['The Hague'], country: 'Netherlands' },
  'espana destinos de coche': { cityNames: [], country: 'Spain' },
  'gaudi': { cityNames: ['Barcelona'], country: 'Spain' },
  'germany misc': { cityNames: [], country: 'Germany' },
  'hcmc': { cityNames: ['Ho Chi Minh City'], country: 'Viet Nam' },
  'ho chi minh city': { cityNames: ['Ho Chi Minh City'], country: 'Viet Nam' },
  'hoi an': { cityNames: ['Hoi An'], country: 'Viet Nam' },
  'hill country texas': { cityNames: [], country: 'United States of America' },
  'hilton head': { cityNames: ['Hilton Head'], country: 'United States of America' },
  'hilton head sc': { cityNames: ['Hilton Head'], country: 'United States of America' },
  'innsbruk': { cityNames: ['Innsbruck'], country: 'Austria' },
  'isle of wight': { cityNames: ['Isle of Wight'], country: 'England' },
  'koh samui': { cityNames: ['Ko Samui'], country: 'Thailand' },
  'kusttram stations': { cityNames: [], country: 'Belgium' },
  'lake como': { cityNames: ['Como'], country: 'Italy' },
  'london food and sites': { cityNames: ['London'], country: 'England' },
  'lpq': { cityNames: ['Luang Prabang'], country: 'Laos' },
  'lyon fr': { cityNames: ['Lyon'], country: 'France' },
  'malta': { cityNames: [], country: 'Malta' },
  'manhattan': { cityNames: ['New York City'], country: 'United States of America' },
  'manhattan ny': { cityNames: ['New York City'], country: 'United States of America' },
  'nyc': { cityNames: ['New York City'], country: 'United States of America' },
  'panama': { cityNames: ['Panama City'], country: 'Panama' },
  'phi phi': { cityNames: ['Ko Phi Phi'], country: 'Thailand' },
  'phillipines': { cityNames: [], country: 'Philippines' },
  'pty metro': { cityNames: ['Panama City'], country: 'Panama' },
  'rio': { cityNames: ['Rio de Janeiro'], country: 'Brazil' },
  'saint malo mt sant michel': { cityNames: ['Saint-Malo'], country: 'France' },
  'saranda ksamil': { cityNames: ['Sarandë', 'Ksamil'], country: 'Albania' },
  'santiago de compostela': { cityNames: ['Santiago de Compostela'], country: 'Spain' },
  'santiago de compostela es': { cityNames: ['Santiago de Compostela'], country: 'Spain' },
  'seoul all sites': { cityNames: ['Seoul'], country: 'South Korea' },
  'seminyak bali': { cityNames: ['Seminyak'], country: 'Indonesia' },
  'canggu bali': { cityNames: ['Canggu'], country: 'Indonesia' },
  'ubud bali': { cityNames: ['Ubud'], country: 'Indonesia' },
  'bali overall': { cityNames: [], country: 'Indonesia' },
  'bali overall can t miss': { cityNames: [], country: 'Indonesia' },
  'bali seminyak': { cityNames: ['Seminyak'], country: 'Indonesia' },
  'skradin': { cityNames: ['Skradin'], country: 'Croatia' },
  'spain misc': { cityNames: [], country: 'Spain' },
  'spanish parks and trails': { cityNames: [], country: 'Spain' },
  'spnish parks and trails': { cityNames: [], country: 'Spain' },
  's uk': { cityNames: [], country: 'England' },
  's uk seaside': { cityNames: [], country: 'England' },
  'uk misc': { cityNames: [], country: 'England' },
  'uk places to visit': { cityNames: [], country: 'England' },
  'misc uk': { cityNames: [], country: 'England' },
  'taipei close and cheap': { cityNames: ['Taipei'], country: 'Taiwan' },
  'thailand misc': { cityNames: [], country: 'Thailand' },
  'turkey': { cityNames: [], country: 'Türkiye' },
  'turkey 1': { cityNames: [], country: 'Türkiye' },
  'utrect': { cityNames: ['Utrecht'], country: 'Netherlands' },
  'utrect nl': { cityNames: ['Utrecht'], country: 'Netherlands' },
  'venezia': { cityNames: ['Venice'], country: 'Italy' },
  'vila joyosa': { cityNames: ['Villajoyosa'], country: 'Spain' },
};

const GENERIC_SAVED_LIST_NAMES = new Set([
  'want to go',
  'bucket list',
  'random bucket list',
  'default list(1)',
  'cool',
  'random',
  'misc',
  'everything sketchy',
  'images',
  'photography spots',
  'spa day',
  'coffee shops',
].map(value => String(value).toLowerCase().trim()));

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (!s) continue;
    const key = locationKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function buildCityCountryLookup(cities: CityRow[]): Map<string, LocationHint> {
  const grouped = new Map<string, { cityNames: Set<string>; countries: Set<string> }>();
  for (const city of cities) {
    if (!city.name || !city.country) continue;
    const key = locationKey(city.name);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, { cityNames: new Set(), countries: new Set() });
    grouped.get(key)!.cityNames.add(city.name);
    grouped.get(key)!.countries.add(city.country);
  }

  const lookup = new Map<string, LocationHint>();
  for (const [key, value] of grouped) {
    if (value.countries.size === 1) {
      lookup.set(key, {
        cityNames: [...value.cityNames],
        country: [...value.countries][0],
      });
    }
  }
  for (const [key, value] of Object.entries(SAVED_LIST_LOCATION_HINTS)) {
    lookup.set(locationKey(key), value);
  }
  return lookup;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 72);
}

function buildMissingSlugPatches(pins: PinRow[]): Map<string, string> {
  const used = new Set(
    pins
      .map(pin => String(pin.slug ?? '').trim())
      .filter(Boolean),
  );
  const out = new Map<string, string>();
  const missing = pins
    .filter(pin => isEmpty(pin.slug))
    .sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`));

  for (const pin of missing) {
    const base = slugify(pin.name) || `pin-${pin.id.slice(0, 8)}`;
    let candidate = base;
    if (used.has(candidate)) candidate = `${base}-${pin.id.slice(0, 8)}`;
    let counter = 2;
    while (used.has(candidate)) candidate = `${base}-${pin.id.slice(0, 12)}-${counter++}`;
    used.add(candidate);
    out.set(pin.id, candidate);
  }
  return out;
}

function rawSavedListKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function savedListNames(pin: PinRow): string[] {
  return [...(Array.isArray(pin.saved_lists) ? pin.saved_lists : []), ...(Array.isArray(pin.lists) ? pin.lists : [])]
    .map(String)
    .filter(Boolean);
}

function hasOnlyGenericSavedLists(pin: PinRow): boolean {
  const lists = savedListNames(pin);
  return lists.length > 0 && lists.every(list => GENERIC_SAVED_LIST_NAMES.has(rawSavedListKey(list)));
}

function inferLocationFromSavedLists(pin: PinRow, cityCountryLookup: Map<string, LocationHint>): LocationHint | null {
  const lists = savedListNames(pin);
  const hints: LocationHint[] = [];
  for (const list of lists) {
    if (GENERIC_SAVED_LIST_NAMES.has(rawSavedListKey(list))) continue;
    const key = locationKey(list);
    if (!key) continue;
    const direct = cityCountryLookup.get(key);
    if (direct) {
      hints.push(direct);
      continue;
    }
    const words = key.split(' ').filter(Boolean);
    for (let length = Math.min(3, words.length); length >= 1; length--) {
      if (length === 1) continue;
      for (let start = 0; start + length <= words.length; start++) {
        const phrase = words.slice(start, start + length).join(' ');
        const hint = cityCountryLookup.get(phrase);
        if (hint) hints.push(hint);
      }
    }
  }
  if (!hints.length) return null;
  const countries = uniqueStrings(hints.map(hint => hint.country));
  if (countries.length !== 1) return null;
  const cityNames = uniqueStrings(hints.flatMap(hint => hint.cityNames));
  return { cityNames, country: countries[0] };
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
    'opening_hours', 'price_text', 'price_amount', 'price_currency', 'price_details',
    'cuisine', 'meal_types', 'dietary_options', 'price_tier', 'nights_stayed',
    'would_stay_again', 'hotel_vibe', 'duration_minutes', 'best_time_of_day',
    'indoor_outdoor', 'food_on_site', 'restrooms', 'wifi', 'parking', 'booking_required',
    'free', 'free_to_visit', 'admission', 'official_ticket_url', 'booking_url',
    'hours_source_url', 'price_source_url', 'enrichment_status', 'enrichment_notes',
    'lists', 'saved_lists', 'tags', 'wikidata_qid', 'wikipedia_url', 'unesco_id', 'phone',
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

async function fetchAllCities(): Promise<CityRow[]> {
  const out: CityRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await sb.from('go_cities').select('name,country').range(start, start + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as CityRow[]));
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
  if (OFFLINE) return false;
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

function derivedPatch(pin: PinRow, cityCountryLookup: Map<string, LocationHint>): Record<string, any> {
  const patch: Record<string, any> = {};
  const defaultKind = !String(pin.source ?? '').startsWith('google-saved-list') || !isEmpty(pin.category);
  const inferredKind = categoryToKind(pin.category, pin.name, pin.kind, defaultKind);
  if (
    inferredKind &&
    pin.kind !== inferredKind &&
    (isEmpty(pin.kind) || String(pin.source ?? '').startsWith('google-takeout'))
  ) {
    patch.kind = inferredKind;
  }
  const { city, country } = locationFromAddress(pin.address);
  if (city && (isEmpty(pin.city_names) || hasMessyLocation(pin.city_names))) patch.city_names = [city];
  if (country && (isEmpty(pin.states_names) || hasMessyLocation(pin.states_names))) patch.states_names = [country];
  const savedListLocation = inferLocationFromSavedLists({ ...pin, ...patch }, cityCountryLookup);
  if (savedListLocation) {
    if (savedListLocation.cityNames.length && isEmpty(pin.city_names) && isEmpty(patch.city_names)) {
      patch.city_names = savedListLocation.cityNames;
    }
    if (savedListLocation.country && isEmpty(pin.states_names) && isEmpty(patch.states_names)) {
      patch.states_names = [savedListLocation.country];
    }
  }
  if (
    String(pin.source ?? '') === 'google-saved-list' &&
    hasOnlyGenericSavedLists(pin) &&
    isEmpty(pin.city_names) &&
    Array.isArray(pin.states_names) &&
    pin.states_names.length === 1 &&
    pin.states_names[0] === 'England'
  ) {
    patch.states_names = [];
  }
  if (isEmpty(pin.google_place_url)) {
    const fallback = fallbackGoogleMapsUrl(pin);
    if (fallback) patch.google_place_url = fallback;
  }
  const effectiveCity = (Array.isArray(patch.city_names)
    ? patch.city_names[0] ?? null
    : (Array.isArray(pin.city_names) ? pin.city_names[0] : null)) || city;
  const effectiveCountry = (Array.isArray(patch.states_names)
    ? patch.states_names[0] ?? null
    : (Array.isArray(pin.states_names) ? pin.states_names[0] : null)) || country;
  const generatedDescriptionNeedsRefresh =
    typeof pin.description === 'string' &&
    pin.description.startsWith(`${pin.name} is `) &&
    (descriptionHasMessyLocation(pin.description) ||
      /\bis a attraction\b/.test(pin.description) ||
      (hasOnlyGenericSavedLists(pin) && isEmpty(pin.city_names) && isEmpty(pin.states_names) && /\bin England\b/.test(pin.description)) ||
      Boolean(patch.kind) ||
      Boolean(patch.city_names) ||
      Boolean(patch.states_names));
  if (isEmpty(pin.description) || generatedDescriptionNeedsRefresh) {
    patch.description = makeDescription({ ...pin, ...patch }, effectiveCity, effectiveCountry, patch.category ?? pin.category);
  }

  const cuisine = inferCuisine({ ...pin, ...patch });
  if (cuisine && isEmpty(pin.cuisine)) patch.cuisine = cuisine;

  const mealTypes = inferMealTypes({ ...pin, ...patch });
  if (mealTypes && isEmpty(pin.meal_types)) patch.meal_types = mealTypes;

  const dietaryOptions = inferDietaryOptions({ ...pin, ...patch });
  if (dietaryOptions && isEmpty(pin.dietary_options)) patch.dietary_options = dietaryOptions;

  const priceTier = inferPriceTier({ ...pin, ...patch });
  if (priceTier && isEmpty(pin.price_tier)) patch.price_tier = priceTier;

  const hotelVibe = inferHotelVibe({ ...pin, ...patch });
  if (hotelVibe && isEmpty(pin.hotel_vibe)) patch.hotel_vibe = hotelVibe;

  const effectiveForFacets = { ...pin, ...patch };
  if (effectiveForFacets.kind === 'hotel') {
    if (isEmpty(pin.wifi)) patch.wifi = true;
    if (isEmpty(pin.restrooms)) patch.restrooms = 'modern';
    if (isEmpty(pin.food_on_site)) patch.food_on_site = 'restaurant';
  }

  const foodOnSite = inferFoodOnSite(effectiveForFacets);
  if (foodOnSite && isEmpty(pin.food_on_site)) patch.food_on_site = foodOnSite;

  const freeToVisit = inferFreeToVisit({ ...pin, ...patch });
  if (freeToVisit !== null && isEmpty(pin.free_to_visit)) patch.free_to_visit = freeToVisit;

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

  const [pins, cities] = await Promise.all([fetchAllPins(), fetchAllCities()]);
  const cityCountryLookup = buildCityCountryLookup(cities);
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
  const slugPatches = buildMissingSlugPatches(latestPins);
  const allPatches = new Map<string, { id: string; name: string; patch: Record<string, any> }>();
  for (const pin of latestPins) {
    const lookupPatch = lookupPatches.get(pin.id) ?? {};
    const slugPatch = slugPatches.has(pin.id) ? { slug: slugPatches.get(pin.id) } : {};
    const withLookup = { ...pin, ...lookupPatch };
    const patch = compactPatch({ ...lookupPatch, ...slugPatch, ...derivedPatch(withLookup as PinRow, cityCountryLookup) }, pin);
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
