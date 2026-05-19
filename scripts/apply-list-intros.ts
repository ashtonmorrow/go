/**
 * One-shot: rewrite the frontmatter `description` and the body intro
 * paragraph of list guides into Mike's first-person voice.
 *
 * Pure text replacement (no gray-matter round-trip) so the in-frontmatter
 * authoring-note comment blocks are preserved. The body intro is defined
 * as everything between the closing frontmatter fence and the first
 * `\n## ` heading; it is replaced wholesale.
 *
 * Idempotent: re-running with the same map yields the same files.
 * Run with --write to apply; without, it is a dry run.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 1 ---
  'alicante-metro-stops': {
    description: 'My station-by-station notes for using the Alicante tram as a no-car way up the Costa Blanca, from El Campello to the Benidorm beaches.',
    intro: "The [Alicante](/cities/alicante) tram is what makes a beach day work without a rental car. Here are the stops I'd actually get off at, riding the line up the Costa Blanca from the city toward [El Campello](/pins/el-campello) and [Benidorm](/pins/benidorm).",
  },
  'alicante': {
    description: 'My case for Alicante, the sunny Costa Blanca city travelers skip. The in-town beach, the hilltop castle, the June bonfire festival, and the train from Madrid.',
    intro: "[Alicante](/cities/alicante) is the Spanish beach city I keep recommending that almost nobody books. It gets some of the most sunshine in Europe, has a swimmable beach right in the middle of town, a castle on the hill above it, and tapas for a euro. Here's how I'd spend a few days there.",
  },
  'amsterdam': {
    description: 'My Amsterdam travel guide. Walking the canal ring, where to stay, King’s Day and Keukenhof tulip season, the Schiphol train, and day trips like Zaanse Schans.',
    intro: "[Amsterdam](/cities/amsterdam) is smaller and easier than it looks, a wheel of canals you can mostly cross on foot. The thing I tell every first-timer is that the Dutch trains are so good that basing outside the city and riding in is a real option, not a compromise. Here's how I'd plan it, day trips included.",
  },
  'annecy': {
    description: 'My Annecy travel guide. The canal-threaded old town, swimming in Lake Annecy, the Palais de l’Ile, the markets, and where to eat.',
    intro: "[Annecy](/cities/annecy) is the French Alpine town that looks faked: a lake clean enough to swim in, an old town threaded with canals, mountains rising straight out of the water. A day or two is all it takes. Here's what I'd do with the time.",
  },
  'antwerp': {
    description: 'My Antwerp travel guide. The Cathedral of Our Lady, the showpiece Central Station, the fashion and diamond districts, where to stay, and where to eat.',
    intro: "[Antwerp](/cities/antwerp) is Belgium's second city and its sharpest, a place of fashion, diamonds, and Rubens with a railway station grand enough to be a sight in itself. A day or two covers it. Here's how I'd use the time.",
  },
  'athens': {
    description: 'My Athens travel guide. Why two days is not enough, booking the Acropolis, Plaka tavernas, the National Archaeological Museum, and Cape Sounion at sunset.',
    intro: "Most people give [Athens](/cities/athens) two days and leave underwhelmed, and I think they plan it wrong. Two days does the headline sights, three is the sweet spot, four if you want Delphi as an overnight. Here's how I'd shape it, plus the two things worth planning around.",
  },
  'avila': {
    description: 'My Ávila travel guide. The most complete medieval walls in Spain, the easy day trip from Madrid, Saint Teresa’s town, and where to eat.',
    intro: "[Ávila](/cities/avila) is the easiest great day trip out of Madrid: a small granite town wrapped in the most complete set of medieval walls in Spain, a stone circuit you can walk the whole way around. Here's what I'd see in a day.",
  },
  'bali': {
    description: "My Bali travel guide. Which base fits which trip, from Seminyak's beach clubs to Canggu's surf to Ubud's inland temples.",
    intro: "Bali gets mis-planned more than almost anywhere, because the postcard, the rice terraces, the surf breaks, the cliff pools, lives in three different parts of an island that take real time to cross. The one decision that shapes the whole trip is where you base. Here's how I'd pick.",
  },
  'balkan-green-markets': {
    description: 'My working list of green markets across the Balkans, saved on long city stays for apartment cooking, honey and figs, and a morning wander.',
    intro: "When I'm in a city for weeks at a time, the green market is how I work out how the place actually eats. Here's my running list of the Balkan ones worth saving on a map, some for cooking, some for gifts, some for a slow morning walk.",
  },
  'bangkok': {
    description: 'My Bangkok travel guide. Where to stay in Sukhumvit or Riverside, the BTS mall walk for jet-lagged days, the river temple circuit, and Yaowarat at night.',
    intro: "[Bangkok](/cities/bangkok) is where most Thailand trips begin, and it's worth a few days even when a beach is the real reason you came. It works far better once you stop fighting the traffic and move by river and BTS instead. Here's how I'd plan the city itself. The country-level version is in [my Thailand notes](/posts/thailand-travel-notes).",
  },
  'barcelona': {
    description: 'My Barcelona travel guide. Where to stay (Poblenou over the Gothic Quarter), why the city is ending Airbnb, neighborhood food, and Sitges as a day trip.',
    intro: "I love [Barcelona](/cities/barcelona), but in 2026 it's a city pushing back hard on tourism, and the default first-trip script (an Airbnb on La Rambla, dinner in the Gothic Quarter) is exactly the version locals want gone. Here's how I'd do it instead: Poblenou as a base, eating a block off the tourist spine, the big monuments treated as quick metro stops.",
  },
  'bath-uk': {
    description: 'My Bath travel guide. The day trip versus the overnight, where to stay, the riverside walk, the Bathwick Boatman roast, and Stonehenge as the add-on.',
    intro: "Most people see Bath in a single day from London, and it's a good day: the Roman baths, the abbey, and the honey-stone Georgian streets all sit fifteen minutes apart. But it's better with a night. Here's how I'd do both versions. The thermal-spa side lives in my [spa-day list](/lists/spa-day).",
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
