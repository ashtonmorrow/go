import 'server-only';

/** Editor-side flat shape. Mirrors the Postgres column names so the client can
 *  POST any field directly to /api/admin/update-pin without remapping. */
export type PinEditorState = {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  kind: string | null;

  // Status
  visited: boolean;
  status: string | null;
  closure_reason: string | null;

  // Description
  description: string | null;

  // Location
  lat: number | null;
  lng: number | null;
  city_names: string[];
  states_names: string[];
  address: string | null;

  // Practical
  website: string | null;
  hours: string | null;
  /** International phone (E.164). Editable; populated by the Google
   *  Places enrich button on this page or via bulk enrichment. */
  phone: string | null;
  /** Google's price level 0-4. Read-only in the form (the enrich button
   *  is the only writer). Surfaced as a chip in the "From Google" card. */
  price_level: number | null;
  /** Full hours_details jsonb. Read-only in the form. Rendered as a
   *  small weekly table inside the "From Google" card so the user can
   *  see what came back without leaving the editor. */
  hours_details: unknown;

  // Cost (legacy)
  price_text: string | null;
  price_amount: number | null;
  price_currency: string | null;
  free: boolean | null;

  // Universal personal experience
  personal_rating: number | null;
  personal_review: string | null;
  visit_year: number | null;
  personal_notes: string | null;
  companions: string[];
  best_for: string[];

  // Hotel
  nights_stayed: number | null;
  room_type: string | null;
  room_price_per_night: number | null;
  room_price_currency: string | null;
  would_stay_again: boolean | null;
  hotel_vibe: string[];
  breakfast_quality: string | null;
  wifi_quality: string | null;
  noise_level: string | null;
  location_pitch: string | null;

  // Restaurant
  cuisine: string[];
  meal_types: string[];
  dishes_tried: string[];
  dietary_options: string[];
  reservation_recommended: boolean | null;
  price_tier: string | null;
  price_per_person_usd: number | null;

  // SEO
  indexable: boolean;
};

const asStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function rowToPinForEdit(row: any): PinEditorState {
  return {
    id: row.id,
    name: row.name ?? '',
    slug: asStr(row.slug),
    category: asStr(row.category),
    kind: asStr(row.kind),

    visited: !!row.visited,
    status: asStr(row.status),
    closure_reason: asStr(row.closure_reason),

    description: asStr(row.description),

    lat: asNum(row.lat),
    lng: asNum(row.lng),
    city_names: asArr(row.city_names),
    states_names: asArr(row.states_names),
    address: asStr(row.address),

    website: asStr(row.website),
    hours: asStr(row.hours),
    phone: asStr(row.phone),
    price_level: asNum(row.price_level),
    hours_details: row.hours_details ?? null,

    price_text: asStr(row.price_text),
    price_amount: asNum(row.price_amount),
    price_currency: asStr(row.price_currency),
    free: asBool(row.free),

    personal_rating: asNum(row.personal_rating),
    personal_review: asStr(row.personal_review),
    visit_year: asNum(row.visit_year),
    personal_notes: asStr(row.personal_notes),
    companions: asArr(row.companions),
    best_for: asArr(row.best_for),

    nights_stayed: asNum(row.nights_stayed),
    room_type: asStr(row.room_type),
    room_price_per_night: asNum(row.room_price_per_night),
    room_price_currency: asStr(row.room_price_currency),
    would_stay_again: asBool(row.would_stay_again),
    hotel_vibe: asArr(row.hotel_vibe),
    breakfast_quality: asStr(row.breakfast_quality),
    wifi_quality: asStr(row.wifi_quality),
    noise_level: asStr(row.noise_level),
    location_pitch: asStr(row.location_pitch),

    cuisine: asArr(row.cuisine),
    meal_types: asArr(row.meal_types),
    dishes_tried: asArr(row.dishes_tried),
    dietary_options: asArr(row.dietary_options),
    reservation_recommended: asBool(row.reservation_recommended),
    price_tier: asStr(row.price_tier),
    price_per_person_usd: asNum(row.price_per_person_usd),

    indexable: !!row.indexable,
  };
}
