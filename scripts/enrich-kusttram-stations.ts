import { createClient } from '@supabase/supabase-js';

const LIST_NAME = 'kusttram stations';
const OFFICIAL_ROUTE_RELATIONS = [406258, 3348002] as const;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const WRITE = process.argv.includes('--write');
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pdjrvlhepiwkshxerkpz.supabase.co';
const SERVICE_ROLE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: Array<{ type: 'node' | 'way' | 'relation'; ref: number; role: string }>;
  tags?: Record<string, string>;
};

type Stop = {
  name: string;
  lat: number;
  lng: number;
  city: string;
};

type PinRow = {
  id: string;
  name: string;
  slug: string | null;
  visited: boolean | null;
  saved_lists: string[] | null;
};

const CITY_PREFIXES = [
  'Oostduinkerke',
  'Blankenberge',
  'Lombardsijde',
  'Middelkerke',
  'Mariakerke',
  'Nieuwpoort',
  'Zeebrugge',
  'Duinbergen',
  'Westende',
  'Wenduine',
  'Raversijde',
  'Koksijde',
  'Oostende',
  'Bredene',
  'De Panne',
  'De Haan',
  'Heist',
  'Knokke',
] as const;

const EXISTING_NAME_BY_OFFICIAL: Record<string, string> = {
  'Bredene Duinenplein': 'Bredene Aan Zee',
  'De Haan Zeepreventorium': 'De Haan Preventorium',
  'De Haan Zwarte Kiezel': 'Zwarte Kiezel',
  'Duinbergen Kerk': 'Duinbergen',
  'Koksijde Ster der Zee': 'Koksijde Ster Der Zee',
  'Oostduinkerke Groenendijk': 'Oostduinkerke Groenendijk Bad',
  'Oostende Marie-Joséplein': 'Marie-Joséplein',
  'Oostende Station': 'Oostende',
  'Oostende Vismijn': 'Oostende Weg Naar Vismijn',
  'Raversijde Provinciedomein': 'Raversijde Domein Raversijde',
  'Westende Bellevue': 'Westende Belle Vue',
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function cityFor(stopName: string): string {
  return CITY_PREFIXES.find(prefix => stopName.startsWith(prefix)) ?? 'Belgian coast';
}

function key(element: Pick<OsmElement, 'type' | 'id'>): string {
  return `${element.type}/${element.id}`;
}

function centerOf(element: OsmElement | undefined, byKey: Map<string, OsmElement>) {
  if (!element) return null;
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.type === 'way' && Array.isArray(element.nodes)) {
    const points = element.nodes
      .map(id => byKey.get(`node/${id}`))
      .filter((node): node is OsmElement =>
        !!node && typeof node.lat === 'number' && typeof node.lon === 'number',
      );
    if (points.length > 0) {
      return {
        lat: points.reduce((sum, point) => sum + (point.lat as number), 0) / points.length,
        lng: points.reduce((sum, point) => sum + (point.lon as number), 0) / points.length,
      };
    }
  }
  return null;
}

async function fetchOsmElements(): Promise<OsmElement[]> {
  const query = `[out:json][timeout:60];relation(id:${OFFICIAL_ROUTE_RELATIONS.join(',')});out body;>;out body qt;`;
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'go.mike-lee.me Kusttram station enrichment',
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Overpass request failed: ${response.status} ${response.statusText}\n${text.slice(0, 500)}`,
    );
  }
  const json = await response.json() as { elements?: OsmElement[] };
  return json.elements ?? [];
}

function stopsForRelation(
  relationId: number,
  byKey: Map<string, OsmElement>,
): Stop[] {
  const relation = byKey.get(`relation/${relationId}`);
  const members = relation?.members ?? [];
  const stops: Stop[] = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i]!;
    const element = byKey.get(`${member.type}/${member.ref}`);
    const tags = element?.tags;
    if (!element || !tags?.name) continue;

    const isStop =
      member.role === 'stop' ||
      tags.public_transport === 'stop_position' ||
      tags.railway === 'tram_stop';
    const isPlatform = member.role === 'platform' || tags.public_transport === 'platform';
    if (!isStop && !isPlatform) continue;

    let name = tags.name;
    const coords = centerOf(element, byKey);
    if (!coords) continue;

    if (/^\d+$/.test(name)) {
      const next = members[i + 1];
      const nextElement = next ? byKey.get(`${next.type}/${next.ref}`) : null;
      if (nextElement?.tags?.name) name = nextElement.tags.name;
    }

    if (/^\d+$/.test(name)) continue;
    if (stops.at(-1)?.name === name) continue;
    stops.push({ name, city: cityFor(name), ...coords });
  }

  return stops;
}

async function fetchOfficialStops(): Promise<Stop[]> {
  const elements = await fetchOsmElements();
  const byKey = new Map(elements.map(element => [key(element), element]));
  const west = stopsForRelation(406258, byKey);
  const east = stopsForRelation(3348002, byKey).slice(1);
  return [...west, ...east];
}

function listWithName(current: string[] | null, name: string): string[] {
  const set = new Set(current ?? []);
  set.add(name);
  return Array.from(set);
}

function listWithoutName(current: string[] | null, name: string): string[] {
  return (current ?? []).filter(item => item !== name);
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('STRAY_SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  const stops = await fetchOfficialStops();
  if (stops.length !== 67) {
    throw new Error(`Expected 67 Kusttram stops, found ${stops.length}`);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const officialSlugs = stops.map(stop => slugify(stop.name));

  const [{ data: currentPins, error: currentError }, { data: slugPins, error: slugError }] =
    await Promise.all([
      sb
        .from('pins')
        .select('id, name, slug, visited, saved_lists')
        .overlaps('saved_lists', [LIST_NAME]),
      sb
        .from('pins')
        .select('id, name, slug, visited, saved_lists')
        .in('slug', officialSlugs),
    ]);

  if (currentError) throw currentError;
  if (slugError) throw slugError;

  const candidates = new Map<string, PinRow>();
  for (const pin of [...(currentPins ?? []), ...(slugPins ?? [])] as PinRow[]) {
    candidates.set(pin.id, pin);
  }

  const byName = new Map<string, PinRow>();
  const bySlug = new Map<string, PinRow>();
  for (const pin of candidates.values()) {
    byName.set(normalize(pin.name), pin);
    if (pin.slug) bySlug.set(pin.slug, pin);
  }

  const matchedIds = new Set<string>();
  const orderedIds: string[] = [];
  let inserted = 0;
  let updated = 0;
  let removed = 0;

  for (const stop of stops) {
    const alias = EXISTING_NAME_BY_OFFICIAL[stop.name];
    const pin =
      byName.get(normalize(stop.name)) ??
      (alias ? byName.get(normalize(alias)) : undefined) ??
      bySlug.get(slugify(stop.name));

    const patch = {
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      city_names: [stop.city],
      states_names: ['Belgium'],
      category: 'Transit',
      kind: 'transit',
      saved_lists: listWithName(pin?.saved_lists ?? null, LIST_NAME),
      website: 'https://www.delijn.be/en/content/kusttram/',
      indexable: true,
      updated_at: new Date().toISOString(),
    };

    if (pin) {
      matchedIds.add(pin.id);
      orderedIds.push(pin.id);
      updated += 1;
      if (WRITE) {
        const { error } = await sb.from('pins').update(patch).eq('id', pin.id);
        if (error) throw error;
      }
    } else {
      inserted += 1;
      if (WRITE) {
        let slug = slugify(stop.name);
        const { data: existingSlug } = await sb
          .from('pins')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (existingSlug) slug = `${slug}-tram`;
        const { data, error } = await sb
          .from('pins')
          .insert({ ...patch, slug, visited: false })
          .select('id')
          .single();
        if (error) throw error;
        matchedIds.add(data.id);
        orderedIds.push(data.id);
      } else {
        orderedIds.push(`new:${slugify(stop.name)}`);
      }
    }
  }

  for (const pin of currentPins as PinRow[]) {
    if (matchedIds.has(pin.id)) continue;
    const next = listWithoutName(pin.saved_lists, LIST_NAME);
    removed += 1;
    if (WRITE) {
      const { error } = await sb
        .from('pins')
        .update({ saved_lists: next, updated_at: new Date().toISOString() })
        .eq('id', pin.id);
      if (error) throw error;
    }
  }

  if (WRITE) {
    const { error } = await sb
      .from('saved_lists')
      .upsert({ name: LIST_NAME, pin_order: orderedIds, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  console.log(JSON.stringify({
    mode: WRITE ? 'write' : 'dry-run',
    officialStops: stops.length,
    matchedOrUpdated: updated,
    inserted,
    removedFromList: removed,
    orderedIds: orderedIds.length,
  }, null, 2));

  if (!WRITE) {
    console.log('Run with --write to update Supabase.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
