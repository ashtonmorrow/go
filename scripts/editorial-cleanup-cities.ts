/**
 * Clean travel copy in go_cities so it follows the house editorial voice:
 * literal phrasing, no em dashes, no unsupported prestige adjectives, and
 * complete, publishable sentences for curated city pages.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[edit] Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const COPY_FIELDS = [
  'about',
  'why_visit',
  'avoid',
  'hot_season_name',
  'hot_season_description',
  'cold_season_name',
  'cooler_wetter_season',
  'quote',
] as const;

type CopyField = (typeof COPY_FIELDS)[number];

type CityRow = {
  id: string;
  name: string;
  slug: string | null;
  been: boolean | null;
  go: boolean | null;
} & Record<CopyField, string | null>;

type CopyPatch = Partial<Record<CopyField, string>>;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
].join('|');

const DIRECT_PATCHES: Record<string, CopyPatch> = {
  'athens-georgia': {
    about: 'Athens is a university city in northeast Georgia, formed today as a consolidated government with Clarke County. The University of Georgia shapes its economy, street life, and music scene, while downtown keeps the scale of a smaller Southern city.',
    why_visit: 'Visit for a compact college-town trip with independent music venues, university museums, bookstores, and walkable downtown blocks. It works well as a cultural stop between Atlanta and the Georgia Piedmont.',
    avoid: 'Late July and August are the least comfortable months for long walks because heat, humidity, and afternoon storms can build quickly.',
    hot_season_name: 'Summer (June to September)',
    hot_season_description: 'Summers are hot and humid, with average highs in the low 30s C and frequent thunderstorm risk.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are short and cool, with occasional freezes but little sustained cold. Rain is possible in every season.',
  },
  nashville: {
    about: 'Nashville is the capital of Tennessee and a major city on the Cumberland River. Its public identity is tied to country music, recording studios, universities, health care, and state government.',
    why_visit: 'Visit for live music, recording history, and the institutional side of American popular music, including the Ryman Auditorium, the Country Music Hall of Fame, and smaller songwriter rooms.',
    avoid: 'Broadway and the hotel district are most crowded around major event weekends. July and August add heavy humidity, which can make outdoor plans tiring.',
    hot_season_name: 'Summer (June to September)',
    hot_season_description: 'Summers are hot and humid, with highs often above 30 C and thunderstorms most common late in the day.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cool and variable. Snow is usually limited, but cold rain and occasional ice can disrupt travel.',
  },
  'toledo-642b9f': {
    about: 'Toledo is an Ohio city at the western end of Lake Erie, where the Maumee River reaches the Great Lakes. Its port, manufacturing history, and museum collections give it a clearer identity than its size suggests.',
    why_visit: 'Visit for the Toledo Museum of Art, the glassmaking history behind the city’s nickname, and the waterfront position near Lake Erie and northwest Ohio wetlands.',
    avoid: 'January and February can be cold, gray, and windy. Lake-effect weather and winter road conditions can make a short visit less flexible.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm to hot, with humid afternoons and thunderstorms. Lake Erie can moderate temperatures near the water.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cold, with regular freezing temperatures, wind, and occasional snow or ice.',
  },
  orlando: {
    about: 'Orlando is an inland Central Florida city and the center of one of the United States’ largest tourism regions. Its identity combines theme parks, convention travel, suburban growth, and a smaller downtown civic core.',
    why_visit: 'Visit when the trip is built around theme parks, family travel, conventions, or Central Florida day trips. The city is practical rather than subtle, with logistics and timing mattering more than wandering.',
    avoid: 'June through September brings high humidity, daily storm risk, and peak family travel periods. Hurricane season can also affect flights and park schedules.',
    hot_season_name: 'Hot and wet season (May to October)',
    hot_season_description: 'The hottest months are humid, with highs near or above 30 C and frequent afternoon storms.',
    cold_season_name: 'Dry season (November to April)',
    cooler_wetter_season: 'Winter and early spring are milder and drier, with cooler evenings and the most comfortable weather for full days outside.',
  },
  monterey: {
    about: 'Monterey sits on the southern edge of Monterey Bay on California’s Central Coast. Its history includes Spanish and Mexican California, the fishing and canning industries, marine research, and a coastline shaped by fog and cold Pacific water.',
    why_visit: 'Visit for the aquarium, coastal walks, marine life, and the older streets around the former capital of Alta California. It pairs naturally with Carmel, Pacific Grove, and Big Sur if the coastal road is open.',
    avoid: 'Do not plan Monterey as a hot beach trip. Summer often brings cool marine fog, while winter storms can affect Highway 1 and coastal walks.',
    hot_season_name: 'Mild dry season (June to October)',
    hot_season_description: 'Days are mild rather than hot, with dry weather, cool mornings, and frequent fog near the bay.',
    cold_season_name: 'Cool wet season (November to March)',
    cooler_wetter_season: 'Winter is the wetter period, with cool air, stronger surf, and occasional storm systems along the coast.',
  },
  'cambridge-d18263': {
    about: 'Cambridge is a dense university city across the Charles River from Boston. Harvard, MIT, research institutions, bookstores, and older residential neighborhoods give the city its intellectual and urban character.',
    why_visit: 'Visit for university museums, architecture, independent bookstores, lectures, and an easy connection to Boston by foot, bicycle, or transit.',
    avoid: 'January and February are the least comfortable months for walking because of cold, wind, and the possibility of snow or icy sidewalks.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm and humid, with highs in the upper 20s C and occasional hotter days.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cold, with freezing nights, snow risk, and short daylight. Spring can be wet and slow to warm.',
  },
  'san-jose': {
    about: 'San Jose is the largest city in Northern California and the urban center of Silicon Valley. Its older civic core, surrounding suburbs, and technology economy make it different in texture from San Francisco or Oakland.',
    why_visit: 'Visit for Silicon Valley context, regional museums, nearby missions and redwood parks, and access to the South Bay. It is most useful as a base for a specific itinerary rather than as a purely atmospheric city break.',
    avoid: 'Late summer and early autumn can bring heat and wildfire smoke risk in the broader Bay Area. A car-dependent itinerary can also become slow during commute periods.',
    hot_season_name: 'Dry warm season (June to October)',
    hot_season_description: 'Summers and early autumn are dry, with warm afternoons, cooler nights, and little rainfall.',
    cold_season_name: 'Cool wet season (November to March)',
    cooler_wetter_season: 'Winter is the wetter period, with mild days, cool nights, and most of the year’s rain.',
  },
  boston: {
    about: 'Boston is the capital of Massachusetts and the largest city in New England. Its civic identity rests on colonial history, universities, medicine, finance, publishing, and a dense network of neighborhoods around the harbor and Charles River.',
    why_visit: 'Visit for early American history, museums, concert life, university collections, bookstores, and walkable neighborhoods. The city rewards a trip organized by district rather than by a single central monument.',
    avoid: 'January and February are the hardest months for casual walking because of cold, wind, snow risk, and short daylight.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm and humid, with highs in the upper 20s C and occasional heat waves.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cold, with freezing nights and snow or ice possible. Coastal storms can affect flights and rail travel.',
  },
  'alcala-de-henares': {
    why_visit: 'Visit for the university quarter, Cervantes associations, and the UNESCO-listed historic center. April, May, September, and October usually offer the best balance of daylight, walking weather, and manageable crowds.',
  },
  zermatt: {
    why_visit: 'Visit for a car-free alpine base with direct access to Matterhorn viewpoints, high-mountain railways, winter skiing, and summer hiking. The best season depends on the trip: December to April for snow sports, June to September for trails.',
  },
  bruges: {
    why_visit: 'Visit for medieval street patterns, canals, churches, painting collections, and a compact historic center that is easy to read on foot. Spring and autumn usually give the best balance of weather and crowd levels.',
  },
  lugano: {
    why_visit: 'Visit for Ticino’s Italian-speaking culture, lake walks, mountain viewpoints, and a Swiss city form shaped by a southern climate. Spring and autumn are usually the most comfortable seasons for walking.',
  },
  visegrad: {
    avoid: 'July and August are the busiest months on the Danube Bend, with higher accommodation prices and more pressure on the castle, viewpoints, and river services. Spring and autumn are calmer.',
  },
  salisbury: {
    about: 'Salisbury is a cathedral city in Wiltshire, established on its present site in 1220. Its center is defined by Salisbury Cathedral, the Cathedral Close, medieval street patterns, and proximity to Stonehenge and Old Sarum.',
  },
  edfu: {
    why_visit: 'Visit for the Temple of Horus, one of the best-preserved major temples on the Nile route between Luxor and Aswan. November to February gives the most comfortable weather for temple visits.',
  },
  'luang-prabang': {
    about: 'Luang Prabang is a UNESCO-listed former royal city in north-central Laos, set on a peninsula where the Mekong and Nam Khan rivers meet. Buddhist monasteries, French colonial shophouses, royal history, and morning alms routes shape the old town.',
  },
  zurich: {
    about: 'Zurich is Switzerland’s largest city, developed from the Roman settlement of Turicum into a medieval town, Reformation center, and modern financial and cultural capital. The old town, lake, Limmat riverfront, museums, and rail connections make it a practical base as well as a city visit.',
    why_visit: 'Visit for museums, concert life, bookshops, lake walks, and clear rail access to the rest of Switzerland. The city works best when combined with specific cultural stops rather than treated only as a financial center.',
    avoid: 'June to August brings the highest visitor numbers and hotel prices. Winter is quieter, but short daylight and cold rain can limit long outdoor days.',
    hot_season_description: 'Summer is warm, with long daylight and good conditions for lakefront walks, outdoor swimming areas, and evening events.',
    cooler_wetter_season: 'Winter is cold and often gray, with occasional snow and more limited daylight. Museums, concerts, and cafes carry the season better than outdoor sightseeing.',
    quote: 'Züri, wie neui | Zurich, as if new',
  },
  wroclaw: {
    about: 'Wrocław is a city in Lower Silesia shaped by Polish, Bohemian, Habsburg, Prussian, German, and postwar Polish histories. Its rebuilt center, islands, bridges, universities, and museums show how much of the city was reconstructed after the Second World War.',
  },
  shkodra: {
    about: 'Shkodra is one of Albania’s oldest continuously inhabited cities, set between Lake Shkodër, the Buna and Drin rivers, and the foothills of the Albanian Alps. Its long history is visible in Rozafa Castle, Ottoman-era streets, Catholic and Muslim institutions, and its role as a northern Albanian cultural center.',
    why_visit: 'Visit for Rozafa Castle, lake landscapes, photography history, and access to northern Albania. The city is also a practical staging point for routes toward Theth, Valbona, and the Albanian Alps.',
    avoid: 'July and August can be very hot, while winter rain can make lake and mountain excursions less reliable.',
    hot_season_name: 'Summer (June to September)',
    hot_season_description: 'Summers are hot, especially in July and August, with strong sun and limited shade in the exposed parts of the city.',
    cold_season_name: 'Cool wet season (November to March)',
    cooler_wetter_season: 'The cooler months bring more rain and shorter days, though the city remains usable for museums, churches, mosques, and the castle.',
  },
  lucerne: {
    about: 'Lucerne is a central Swiss city on Lake Lucerne, with the Reuss River running through its old town. Its bridges, lakefront, rail connections, and mountain excursions make it one of the clearest introductions to German-speaking Switzerland.',
  },
  sarajevo: {
    about: 'Sarajevo is the capital of Bosnia and Herzegovina, set in a narrow valley along the Miljacka River. Ottoman, Austro-Hungarian, Yugoslav, Olympic, and wartime histories sit close together in the city’s streets and institutions.',
    why_visit: 'Visit for a city where religious architecture, political history, coffee culture, and museums can be read within a compact urban core.',
    avoid: 'Winter can bring snow, icy streets, and poor air quality in the valley. In July and August, heat can build in the city center during the afternoon.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm, with hot afternoons but cooler evenings because of the city’s elevation and surrounding mountains.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cold, with snow possible and occasional air-quality problems when still weather traps pollution in the valley.',
  },
  heidelberg: {
    about: 'Heidelberg is a university city on the Neckar River in Baden-Württemberg. Its old town, castle ruins, river setting, and student population have shaped its reputation since the early modern period and the Romantic era.',
    why_visit: 'Visit for the castle, the old university, the Philosophers’ Walk, and a compact historic center that is easy to understand on foot.',
    avoid: 'Summer weekends can be crowded in the old town and at the castle. Winter is quieter but can be gray and damp.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm, with pleasant river walks in the morning and hotter afternoons in the old town.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cool to cold, with damp days, limited daylight, and occasional frost.',
  },
  venlo: {
    about: 'Venlo is a city in Dutch Limburg on the Maas, close to the German border. Its identity is regional and cross-border, shaped by trade, transport, gardens, and links with North Rhine-Westphalia.',
    why_visit: 'Visit as a practical Limburg stop for the Maas riverfront, regional museums, market streets, and easy movement between the Netherlands and western Germany.',
    avoid: 'Venlo is best for a focused short stop. Sunday and holiday hours can limit shops and smaller sights, and winter weather can make the riverfront less inviting.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are mild to warm, with changeable weather and occasional humid days.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cool and damp, with gray skies, rain, and occasional frost.',
  },
  durres: {
    about: 'Durrës is Albania’s main Adriatic port and one of the country’s oldest cities. Its Roman amphitheatre, Byzantine and Venetian traces, port infrastructure, and beach districts make the city both historical and functional.',
    why_visit: 'Visit for the Roman amphitheatre, seafront, archaeology museum, and an accessible look at Albania’s coast without leaving the Tirana region for long.',
    avoid: 'August brings the heaviest beach traffic and the hottest weather. Port roads and waterfront construction can also make parts of the city feel congested.',
    hot_season_name: 'Summer (June to September)',
    hot_season_description: 'Summers are hot and dry, with strong sun along the waterfront and warm evenings.',
    cold_season_name: 'Cool wet season (November to March)',
    cooler_wetter_season: 'The cooler months are milder than inland Albania but wetter, with more wind and rain on the coast.',
  },
  budva: {
    about: 'Budva is a Montenegrin coastal town known for its walled old town and the beach settlements of the Budva Riviera. Its long settlement history is often experienced today through a compressed mix of heritage tourism, resort development, and nightlife.',
    why_visit: 'Visit for the old town, coastal walks, nearby beaches, and access to other towns on the Montenegrin coast.',
    avoid: 'July and August bring heavy crowds, high accommodation prices, and late-night noise. Visit outside peak summer if the old town matters more than the beach scene.',
    hot_season_name: 'Summer (June to September)',
    hot_season_description: 'Summers are hot and busy, with warm sea temperatures and strong sun along the coast.',
    cold_season_name: 'Cool wet season (November to March)',
    cooler_wetter_season: 'The cooler months are quieter and wetter, with reduced beach activity but more space in the old town.',
  },
  'tenerife-97291e': {
    avoid: 'Avoid assuming the island has one climate. The north, south, coast, and Teide area can differ sharply, and holiday periods bring heavy traffic around beaches and viewpoints.',
  },
  'bar-mne': {
    about: 'Bar is a Montenegrin seaport on the southern Adriatic, with the modern town by the coast and Stari Bar inland below Mount Rumija. The contrast between port infrastructure, old stone ruins, olive groves, and beaches gives the city its shape.',
    why_visit: 'Visit for Stari Bar, the old olive tree at Mirovica, ferry and rail connections, and a less polished view of the Montenegrin coast.',
    avoid: 'The modern port area is not the reason to come. In peak summer, heat and beach traffic can make short sightseeing stops slower.',
    hot_season_description: 'Summers are hot and dry, with strong sun and warm evenings near the coast.',
    cooler_wetter_season: 'The cooler months are quieter, with more rain and wind but better conditions for walking around Stari Bar.',
  },
  rennes: {
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are mild to warm, with long daylight, changeable skies, and occasional rain.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cool and damp rather than severe, with frequent gray days and rain.',
  },
  ulm: {
    about: 'Ulm is a city on the Danube in Baden-Württemberg, facing Neu-Ulm across the river in Bavaria. It is known for Ulm Minster, a medieval old town, engineering and university institutions, and as the birthplace of Albert Einstein.',
    why_visit: 'Visit for Ulm Minster, the Fischerviertel, Danube walks, and a compact city that links Swabian history with modern science and design institutions.',
    avoid: 'Winter can be cold, foggy, and short on daylight. Summer Saturdays concentrate visitors around the minster and old town.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm, with comfortable mornings and occasional hotter afternoons.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cold for southern Germany, with frost, fog, and occasional snow.',
  },
  ljubljana: {
    about: 'Ljubljana is Slovenia’s capital, set on the Ljubljanica River between the Alps, the Karst, and routes toward the Adriatic and Danube regions. Its center is shaped by medieval streets, Baroque buildings, and the twentieth-century work of architect Jože Plečnik.',
    why_visit: 'Visit for Plečnik’s urban design, the castle, riverfront walks, museums, and an easy base for day trips across Slovenia.',
    avoid: 'August can be hot and busy in the center, while winter brings short days and damp cold.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are warm, with outdoor dining along the river and occasional thunderstorms.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cold and often damp, with fog possible in the basin and snow in the surrounding region.',
  },
  Verona: {
    about: 'Verona is a Veneto city on the Adige River, known for its Roman amphitheatre, medieval and Renaissance streets, and annual opera season in the Arena. Its literary association with Romeo and Juliet sits beside a more substantial architectural record.',
    why_visit: 'Visit for the Arena, Roman remains, churches, bridges, and opera performances that use the ancient amphitheatre as a working stage.',
    avoid: 'Opera nights and peak summer weekends raise hotel prices and crowd the historic center. July and August can also be hot for daytime walking.',
    hot_season_name: 'Summer (June to August)',
    hot_season_description: 'Summers are hot, with busy evenings around the Arena during the opera season.',
    cold_season_name: 'Winter (December to February)',
    cooler_wetter_season: 'Winters are cool, quieter, and sometimes foggy, with fewer outdoor performances and shorter museum days.',
  },
  granada: {
    avoid: 'July and August are hot, especially below the Alhambra and in exposed streets. Reserve the Alhambra well in advance in any season.',
  },
  cadaques: {
    avoid: 'July and August bring difficult parking, narrow-road traffic, and a much larger day-trip population. Visit outside peak summer if the town itself is the priority.',
  },
  'huế': {
    about: 'Huế is the former imperial capital of the Nguyễn dynasty in central Vietnam, arranged around the Perfume River and the walled Imperial City. Its monuments, court culture, Buddhist sites, and war history make it one of Vietnam’s most historically legible cities.',
    why_visit: 'Visit for the Imperial City, royal tombs, pagodas, river landscapes, and a slower historical itinerary between Hanoi and Đà Nẵng.',
    avoid: 'September through December is the wettest and storm-prone period, when flooding can affect roads, monuments, and river travel.',
    hot_season_name: 'Hot season (May to August)',
    hot_season_description: 'Late spring and summer are hot and humid, with high temperatures and intense sun before the heaviest rains arrive.',
    cold_season_name: 'Wet season (September to January)',
    cooler_wetter_season: 'The wetter months bring heavy rain, flood risk, and occasional tropical-storm disruption. February to April is usually easier for walking.',
  },
};

function cleanCopy(value: string): string {
  let s = value.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('“') && s.endsWith('”'))) {
    s = s.slice(1, -1).trim();
  }

  s = s
    .replace(new RegExp(`\\b(${MONTHS})\\s*[–—]\\s*(${MONTHS})\\b`, 'g'), '$1 to $2')
    .replace(/\b(\d{4})\s*[–—]\s*(\d{4})\b/g, '$1 to $2')
    .replace(/\b(\d{1,2})\s*[–—]\s*(\d{1,2})\b/g, '$1 to $2')
    .replace(/\s+[—–]\s+/g, '; ')
    .replace(/[—–]/g, '-')
    .replace(/\bworst time to travel\b/gi, 'least comfortable time to visit')
    .replace(/\bworst time to visit\b/gi, 'least comfortable time to visit')
    .replace(/\bon a holiday\b/gi, 'for a trip')
    .replace(/\bfor holiday travel\b/gi, 'for a trip')
    .replace(/\bpopular tourist destination\b/gi, 'frequent travel destination')
    .replace(/\bmust-see\b/gi, 'important')
    .replace(/\bhidden gem\b/gi, 'less visited place')
    .replace(/\biconic\b/gi, 'widely recognized')
    .replace(/\btimeless\b/gi, 'long-established')
    .replace(/\bluminous\b/gi, 'clear')
    .replace(/\bprofound\b/gi, 'serious')
    .replace(/\bmasterful\b/gi, 'well made')
    .replace(/\bhaunting\b/gi, 'unsettling')
    .replace(/\brich cultural heritage\b/gi, 'layered cultural history')
    .replace(/\brich musical heritage\b/gi, 'substantial musical history')
    .replace(/\brich history\b/gi, 'long history')
    .replace(/\brich heritage\b/gi, 'layered heritage')
    .replace(/\brich wildlife\b/gi, 'varied wildlife')
    .replace(/\brichly layered\b/gi, 'densely layered')
    .replace(/\brich\b/gi, 'substantial')
    .replace(/\bvibrant culture\b/gi, 'active cultural life')
    .replace(/\bvibrant arts scene\b/gi, 'active arts scene')
    .replace(/\bvibrant cultural scene\b/gi, 'active cultural scene')
    .replace(/\bvibrant nightlife\b/gi, 'busy nightlife')
    .replace(/\bvibrant atmosphere\b/gi, 'busy atmosphere')
    .replace(/\bvibrant\b/gi, 'active')
    .replace(/\bbustling\b/gi, 'busy')
    .replace(/\bcomes alive with\b/gi, 'has more')
    .replace(/\bal fresco\b/gi, 'outdoors')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
}

async function fetchAllCities(): Promise<CityRow[]> {
  const out: CityRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('go_cities')
      .select(`id, name, slug, been, go, ${COPY_FIELDS.join(', ')}`)
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as CityRow[]));
    if (data.length < page) break;
  }
  return out;
}

async function main() {
  console.log(`[edit] Loading curated city copy${DRY_RUN ? ' (dry run)' : ''}...`);
  const rows = (await fetchAllCities()).filter(
    city => !String(city.slug ?? '').startsWith('delete-') && (city.been || city.go)
  );

  let updated = 0;
  let fieldsChanged = 0;
  for (const city of rows) {
    const update: CopyPatch = {};
    for (const field of COPY_FIELDS) {
      const before = city[field];
      if (!before) continue;
      const after = cleanCopy(before);
      if (after && after !== before) update[field] = after;
    }

    const patch = city.slug ? DIRECT_PATCHES[city.slug] : undefined;
    if (patch) Object.assign(update, patch);

    const keys = Object.keys(update) as CopyField[];
    if (keys.length === 0) continue;
    fieldsChanged += keys.length;
    updated++;

    if (DRY_RUN) {
      console.log(`[edit] would update ${city.name}: ${keys.join(', ')}`);
    } else {
      const { error } = await sb
        .from('go_cities')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('id', city.id);
      if (error) {
        console.error(`[edit] update failed for ${city.name}:`, error);
        continue;
      }
      console.log(`[edit] updated ${city.name}: ${keys.join(', ')}`);
    }
  }

  console.log('[edit] Done.');
  console.log(`[edit]   city rows updated: ${updated}`);
  console.log(`[edit]   fields changed:    ${fieldsChanged}`);
}

main().catch(error => {
  console.error('[edit] FATAL:', error);
  process.exit(1);
});
