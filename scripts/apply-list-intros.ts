/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 4 ---
  'dubrovnik': {
    description: 'My Dubrovnik travel guide. Getting in from DBV, where to stay around the Old Town, beating the cruise-ship hours, and the restaurants worth the price.',
    intro: "[Dubrovnik](/cities/dubrovnik) is the Adriatic walled city that was famous long before Game of Thrones, and it has been managing the cruise-ship crush ever since. The Old Town is tiny, the walls walkable in two hours, the food good. Stay at least two nights so you can have it outside the day-tripper window. Here's how I'd time it.",
  },
  'durres': {
    description: 'My Durres travel guide. The Roman amphitheatre, the long Adriatic beach, getting in from Tirana, where to stay, and where to eat.',
    intro: "[Durres](/cities/durres) is the beach end of an Albania trip, the country's main seaside town, with one of the biggest Roman amphitheatres in the Balkans sitting right in the middle of it. It is 40 minutes from Tirana, so it is an easy add. Here's how I'd fit it in.",
  },
  'dusseldorf': {
    description: 'My Dusseldorf travel guide. The Altstadt and its Altbier brewhouses, the Rhine promenade, the MedienHafen, where to stay, and where to eat.',
    intro: "[Düsseldorf](/cities/dusseldorf) is a compact old town so packed with bars it is nicknamed the longest bar in the world, where you drink the dark local Altbier, plus a sharp modern side in fashion and design. A day or two covers it. Here's how I'd use the time.",
  },
  'eastbourne': {
    description: 'My Eastbourne travel guide. The Victorian seafront and pier, the Beachy Head and Seven Sisters cliffs, where to stay, the Towner gallery, and where to eat.',
    intro: "[Eastbourne](/cities/eastbourne) is a quiet, old-fashioned seaside town on the south coast, and the reason to come is right next door: Beachy Head and the Seven Sisters, the great white chalk cliffs of England. A day does the town, an overnight gets you the cliff walk. Here's how I'd split it.",
  },
  'eger': {
    description: "My Eger travel guide. The two-hour train from Budapest, the siege castle, the Ottoman minaret, and the Bull's Blood cellars of the Valley of the Beautiful Women.",
    intro: "[Eger](/cities/eger) is the baroque wine town two hours from Budapest, famous in Hungary for a 1552 siege its castle somehow won and famous to everyone else for the red wine poured in the cellars on its edge. A day does the castle and old town. The wine valley is why you stay the night.",
  },
  'frankfurt': {
    description: 'My Frankfurt travel guide. The Book Fair in October, the Museumsuferfest, the apple-wine taverns of Sachsenhausen, and getting in from FRA.',
    intro: "[Frankfurt](/cities/frankfurt) is the German finance capital most travelers fly into and immediately leave, and that is half right: it is not Berlin or Munich. But it has a better apple-wine-and-traditional-food scene than its reputation, and the Rhine and Moselle valleys are right there. A day or two is enough. Here's what I'd do with it.",
  },
  'gaudi': {
    description: "My guide to Antoni Gaudí's architecture in Barcelona. The Sagrada Família, Park Güell, Casa Batlló, La Pedrera, and how to book the ones that sell out.",
    intro: "Antoni Gaudí shaped the look of [Barcelona](/cities/barcelona) more than anyone, and seven of his buildings now share a single UNESCO listing. This is my Gaudí trail: which works to see, how to book the ones that sell out, and the two that sit outside the city. For the rest of Barcelona, see that guide.",
  },
  'granada': {
    description: 'My Granada travel guide. Getting in from GRX or driving from Málaga, the Alhambra and the Albayzín, and the free-tapas culture worth the trip.',
    intro: "[Granada](/cities/granada) is the one Andalusian city I'd never skip. The Alhambra is one of the most spectacular Islamic-era buildings anywhere, the Albayzín is the medieval Moorish quarter facing it, and the whole city still does free tapas with every drink. Two or three days, and here's how I'd spend them.",
  },
  'gunung-mulu': {
    description: 'My Gunung Mulu travel guide. Routing in through Kuching or Kota Kinabalu, why the Mulu Marriott is the base, what to book at the park, and the Pinnacles trek.',
    intro: "[Gunung Mulu National Park](/cities/gunung-mulu) in [Sarawak](/countries/malaysia) sits on one of the world's biggest cave systems, with bat colonies that pour out of Deer Cave every dusk. It is also hard to reach, a tiny airport, a few turboprops a day, no road in, so plan it well ahead. Here's how I'd do it.",
  },
  'heidelberg': {
    description: "My Heidelberg travel guide. The castle and the Bergbahn, the Old Town and the Old Bridge, the Philosophers' Walk, where to stay, and where to eat.",
    intro: "[Heidelberg](/cities/heidelberg) is the castle town that actually lives up to the pictures, a ruined red-sandstone castle on the hill above an intact medieval old town on the Neckar. It is small enough to see in a day and a short train from Frankfurt. Here's how I'd spend it.",
  },
  'hilton-head-sc': {
    description: 'My Hilton Head travel guide. The RBC Heritage golf week in April, the Lowcountry food, the beaches, and pairing it with Savannah.',
    intro: "[Hilton Head](/cities/hilton-head) is the South Carolina barrier island for a slower week: a wide flat Atlantic beach, pine forest behind it, golf and Lowcountry food carrying the rest. Most people pair it with Savannah, an hour away. Three to five days for a beach trip, more for a real unwind.",
  },
  'ho-chi-minh-city': {
    description: 'My Ho Chi Minh City travel guide. The Vietnam e-visa, where to stay in District 1, the Saigon craft-beer crawl, and a one-day cultural circuit.',
    intro: "[Ho Chi Minh City](/cities/ho-chi-minh-city), Saigon to the people who live there, is the easiest Vietnam city to plan and the easiest to underestimate. It is hot, motorbike-saturated, and a far better craft-beer town than first-timers expect. The culture fits in a day, the beer is its own evening, and the food is why you come back.",
  },
};

const write = process.argv.includes('--write');
const dir = 'content/lists';
let done = 0;
const problems: string[] = [];

for (const [slug, rw] of Object.entries(REWRITES)) {
  const fp = path.join(dir, slug + '.md');
  if (!fs.existsSync(fp)) { problems.push(`MISSING FILE: ${slug}`); continue; }
  const raw = fs.readFileSync(fp, 'utf8');
  if (!raw.startsWith('---\n')) { problems.push(`NO FRONTMATTER: ${slug}`); continue; }
  const fmEnd = raw.indexOf('\n---\n', 4);
  if (fmEnd === -1) { problems.push(`NO FM CLOSE: ${slug}`); continue; }
  let fm = raw.slice(0, fmEnd + 5);
  const body = raw.slice(fmEnd + 5);
  if (!/^description:\s*.*$/m.test(fm)) { problems.push(`NO DESCRIPTION: ${slug}`); continue; }
  fm = fm.replace(/^description:\s*.*$/m, 'description: ' + JSON.stringify(rw.description));
  const h2 = body.indexOf('\n## ');
  if (h2 === -1) { problems.push(`NO H2: ${slug}`); continue; }
  const after = body.slice(h2);
  const newRaw = fm + '\n' + rw.intro + '\n' + after;
  if (write) fs.writeFileSync(fp, newRaw);
  done++;
  console.log(`${write ? 'WROTE' : 'would write'}: ${slug}`);
}

if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log('  ' + p);
}
console.log(`\n${write ? 'wrote' : 'dry run'}: ${done}/${Object.keys(REWRITES).length}`);
