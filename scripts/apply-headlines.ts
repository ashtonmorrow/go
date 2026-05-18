/**
 * One-shot: add a `headline:` frontmatter line to every /content/lists/*.md.
 *
 * `headline` is the editorial voice line that renders as the visible <h1>
 * and the /lists card. It is decoupled from `title`, which stays the
 * keyword SEO <title> tag. See lib/content.ts.
 *
 * Inserts `headline:` immediately after the `title:` line. Pure text
 * insertion — never a gray-matter round-trip — so in-frontmatter authoring
 * comments survive. Skips any file that already has a headline.
 *
 * Run: npx tsx scripts/apply-headlines.ts          (dry run)
 *      npx tsx scripts/apply-headlines.ts --write   (apply)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LISTS_DIR = path.join(process.cwd(), 'content', 'lists');
const WRITE = process.argv.includes('--write');

const HEADLINES: Record<string, string> = {
  'alicante-metro-stops': 'Riding the Alicante tram up the Costa Blanca',
  'alicante': "I don't understand why more people don't visit Alicante",
  'amsterdam': 'Amsterdam, my guide to the canal city and the day trips out',
  'athens': 'Athens is better than the two days most people give it',
  'avila': 'Ávila, the walled city an hour from Madrid',
  'bali': 'Bali, and which base is actually right for your trip',
  'balkan-green-markets': 'A wander through the green markets of the Balkans',
  'bangkok': 'Bangkok gets easier the moment you stop fighting it',
  'barcelona': 'Barcelona, my guide to the Catalan capital',
  'bath-uk': 'Bath is the easy day trip that deserves an overnight',
  'belgrade': "Belgrade is rougher than you expect, and that's the appeal",
  'berlin': 'Berlin, the European capital that plays by its own rules',
  'bernina-express-route': 'Riding the Bernina Express through the Alps',
  'bogota': 'Bogotá deserves more than the layover most people give it',
  'brighton': 'Brighton, the easiest day at the sea from London',
  'bristol': "Bristol doesn't get enough love",
  'bruges': 'Bruges is worth it if you beat the day-trippers',
  'bucharest': 'Bucharest is a slow burn, and worth the patience',
  'budapest': 'Budapest, the two cities the Danube splits',
  'buenos-aires': 'Buenos Aires is the South American capital I send people to first',
  'cabo-verde': 'Cabo Verde, the Atlantic islands most people never consider',
  'cairo': 'Cairo asks more of you than most cities. Go anyway.',
  'cape-town': 'Cape Town, after a few weeks on the ground',
  'cartagena-colombia': 'Cartagena, the walled city on the Colombian Caribbean',
  'chiang-mai': 'Chiang Mai, the slower half of a Thailand trip',
  'cordoba-ar': 'Córdoba, the Argentina most visitors fly past',
  'delft': "Delft, Vermeer's quiet town between the big two",
  'djerba': 'Djerba, the Tunisian island most North Americans have never heard of',
  'dublin': 'Dublin, the city that runs on its pubs',
  'dubrovnik': 'Dubrovnik, and how to see it outside the cruise-ship hours',
  'eger': 'Eger, the Hungarian wine town worth the two-hour train',
  'frankfurt': 'Frankfurt is more than its airport',
  'granada': 'Granada is the one Andalusian city I would never skip',
  'gunung-mulu': 'Gunung Mulu, a rainforest national park with a Marriott in it',
  'hilton-head-sc': 'Hilton Head, the Lowcountry island for a slower week',
  'ho-chi-minh-city': 'Ho Chi Minh City, Saigon at full speed',
  'houston': 'Houston is the most underrated food city in America',
  'khao-yai': 'Khao Yai, the nature break from Bangkok',
  'koh-samui': 'Koh Samui, the quieter Thai island week',
  'kota-kinabalu': 'Kota Kinabalu, Borneo on the easy setting',
  'kotor': 'Kotor, the bay, the walls, and the climb',
  'krabi': 'Krabi, the limestone coast and where to base',
  'kuala-lumpur': 'Kuala Lumpur, a gentle first stop in Southeast Asia',
  'kusttram-stations': 'Riding the Kusttram down the whole Belgian coast',
  'larnaca': 'Larnaca, the low-key way into Cyprus',
  'lisbon': 'Lisbon, my guide to the city of seven hills',
  'london': 'London, the version of it I would actually plan',
  'lyon': "Lyon, France's quiet food capital",
  'madrid': 'Madrid, the Spanish capital that gets underrated',
  'malaga': "Málaga is more than the Costa del Sol's airport",
  'malta': 'Malta, a whole country you can cross in an hour',
  'manchester': 'Manchester, the northern city that reinvented itself',
  'medellin': 'Medellín, the city of eternal spring',
  'milano': 'Milan rewards you once you stop expecting Rome',
  'montevideo': 'Montevideo, the easy add-on to a Buenos Aires trip',
  'munich': 'Munich, the Bavarian capital and the gateway to the Alps',
  'nuremberg': 'Nuremberg, the better German Christmas-market trip',
  'panama': 'Panama City, where the skyline meets the old town',
  'pattaya': 'Pattaya, taken on its own terms',
  'penedes': 'Penedès, the cava country an hour from Barcelona',
  'phi-phi': 'Koh Phi Phi, and what to know before the ferry',
  'phuket': 'Phuket, the practical big-island Thailand trip',
  'playa-del-carmen': 'Playa del Carmen, the Riviera Maya base',
  'prague': 'Prague, the old town everyone walks, done well',
  'rio': "Rio, and how to plan a first trip you won't regret",
  'rome': 'Rome really is as good as advertised',
  'rotterdam': 'Rotterdam, the architectural opposite of Amsterdam',
  'santiago-chile': 'Santiago, a practical capital with wine country beside it',
  'sarajevo': 'Sarajevo carries its history in plain sight',
  'saranda-_-ksamil': 'Saranda and Ksamil, the Albanian Riviera before everyone catches on',
  'seoul': 'Seoul, a ten-million city that somehow feels easy',
  'singapore': 'Singapore, the soft landing into Asia',
  'sitges': 'Sitges, the calmer beach town next to Barcelona',
  'sofia': 'Sofia, the overlooked Balkan capital',
  'spa-day': 'Where to soak after a long-haul flight',
  'split': 'Split, the city built inside a Roman palace',
  'são-paulo': 'São Paulo, the megacity travelers skip and should not',
  'tbilisi': "Tbilisi might be my favorite city you haven't been to",
  'tenerife': 'Tenerife, the volcano and its two very different coasts',
  'the-hague': 'The Hague, the easy alternative to Amsterdam',
  'tirana': 'Tirana, the Balkan capital changing the fastest',
  'tokyo': "Tokyo, the world's largest city, three wards at a time",
  'trogir': 'Trogir, a UNESCO old town and an easy half-day',
  'utrect-nl': 'Utrecht, the Dutch city most visitors skip',
  'venezia': 'Venice is worth it if you plan it right',
  'vienna': 'Vienna still reads like an imperial capital',
  'york': 'York, the walled city worth the trip north',
};

async function main() {
  const files = (await fs.readdir(LISTS_DIR)).filter(f => f.endsWith('.md')).sort();
  let changed = 0;
  let skipped = 0;
  let missing = 0;

  for (const file of files) {
    const slug = file.slice(0, -3);
    const headline = HEADLINES[slug];
    if (!headline) {
      console.warn(`NO HEADLINE for ${slug}`);
      missing++;
      continue;
    }

    const full = path.join(LISTS_DIR, file);
    const raw = await fs.readFile(full, 'utf8');
    const lines = raw.split('\n');

    if (lines[0] !== '---') {
      console.warn(`SKIP ${file}: no frontmatter fence`);
      continue;
    }
    const fmEnd = lines.indexOf('---', 1);
    if (fmEnd === -1) {
      console.warn(`SKIP ${file}: unterminated frontmatter`);
      continue;
    }
    if (lines.slice(1, fmEnd).some(l => /^headline:/.test(l))) {
      skipped++;
      continue;
    }
    const titleIdx = lines.findIndex((l, i) => i > 0 && i < fmEnd && /^title:/.test(l));
    if (titleIdx === -1) {
      console.warn(`SKIP ${file}: no title: line`);
      continue;
    }

    // Double-quote the value; none of the headlines contain a double quote.
    const next = [
      ...lines.slice(0, titleIdx + 1),
      `headline: "${headline}"`,
      ...lines.slice(titleIdx + 1),
    ];
    console.log(`${file}: ${headline}`);
    changed++;
    if (WRITE) await fs.writeFile(full, next.join('\n'), 'utf8');
  }

  console.log(
    `\n${WRITE ? 'WROTE' : 'DRY RUN'} — ${changed} headlines, ${skipped} already had one, ${missing} with no mapping.`,
  );
  if (!WRITE) console.log('Re-run with --write to apply.');
}

main();
