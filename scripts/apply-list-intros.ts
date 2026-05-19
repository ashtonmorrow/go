/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 5 ---
  'houston': {
    description: 'My Houston travel guide. RodeoHouston, where to find the Tex-Mex, the Vietnamese, and the crawfish, and the underrated Houston food story.',
    intro: "[Houston](/cities/houston) is, I'll argue, the most underrated food city in America. It is the most multicultural city in the country, you drive everywhere, and the food is the immigration story: the best Vietnamese in the US, serious Tex-Mex and barbecue, Gulf Coast crawfish. Three or four days, more if it is your gateway to the coast.",
  },
  'ipoh': {
    description: 'My Ipoh travel guide. The colonial old town, the limestone cave temples, the white-coffee-and-bean-sprout-chicken food scene, and where to stay.',
    intro: "[Ipoh](/cities/ipoh) is the Malaysian food town most people pass straight through between KL and Penang. It is an old tin-mining city in a valley of limestone hills, with a walkable colonial center, cave temples in the cliffs, and food worth the stop. A day or two does it. Here's how I'd use them.",
  },
  'istanbul': {
    description: 'My Istanbul travel guide. Hagia Sophia and the old city, the bazaars, a Bosphorus ferry, where to stay, and where to eat.',
    intro: "[Istanbul](/cities/istanbul) is more city than one trip can hold, 15 million people across two continents, with Roman, Byzantine, and Ottoman history stacked under a fast modern metropolis. Four or five days, and you still won't see all of it. Here's how I'd choose.",
  },
  'izmir': {
    description: 'My Izmir travel guide. The Kordon waterfront, Konak Square, the Kemeralti bazaar, where to stay, and the day trip to Ephesus.',
    intro: "[Izmir](/cities/izmir) is the Turkish city Istanbul makes everyone skip, and that is its charm: an easygoing Aegean port built for walking the waterfront, with Ephesus an hour down the road. Two or three unhurried days. Here's how I'd spend them.",
  },
  'khao-yai': {
    description: 'My short Khao Yai guide. The drive from Bangkok, the national park entry, the waterfalls, the wineries, and where to base for a day or two.',
    intro: "[Khao Yai](/cities/khao-yai) is the nature break from Bangkok, the closest real national park to the capital and the easy answer when the heat and traffic start to wear. Three hours by car gets you a vast protected forest and a small wine region that is quietly good. One long day, or two slower ones.",
  },
  'koh-samui': {
    description: 'My Koh Samui travel guide. Choosing between Chaweng, Lamai, Bophut, and Choeng Mon, the beach clubs, the temples and viewpoints, and what to skip.',
    intro: "Koh Samui is the Thai island I'd go back to first when I want the trip to be simple. It is not the cheapest or the most off-grid, but it does logistics well: easy airport, good hotels, beach clubs, temples, and enough variety that a week never repeats. Here's how I'd plan it.",
  },
  'kota-kinabalu': {
    description: 'My Kota Kinabalu travel guide. Where to stay, the Tunku Abdul Rahman island park, Kinabalu Park as a day trip, and what to expect from the city.',
    intro: "[Kota Kinabalu](/cities/kota-kinabalu) is Borneo on the easy setting, the capital of [Sabah](/countries/malaysia), a working Malaysian city facing some of the best sunsets you will see, with an island marine park, a mountain park, and rainforest all within an hour. Here's how I'd use a few days.",
  },
  'kotor': {
    description: 'My Kotor travel guide. Basing around the bay in Perast or Tivat, the old town, climbing the walls early, and dodging the cruise-ship crowds.',
    intro: "Kotor is two things: the Bay of Kotor, the long Adriatic inlet often called Europe's southernmost fjord, and the walled medieval town at the back of it, overrun by cruise ships from mid-morning to late afternoon. Base out on the bay, see the town outside cruise hours, climb the walls early. Two or three days. Here's the shape.",
  },
  'krabi': {
    description: 'My Krabi travel guide. Getting in from KBV, where to stay in Ao Nang, reaching Railay by longtail, and the Andaman-coast restaurants.',
    intro: "[Krabi](/cities/krabi) is the gateway to the Andaman coast's limestone-karst country, Phi Phi, Railay, and a string of cliff-backed beaches. Ao Nang is where most people base. Three or four days for the area, more if you are chaining it with Phi Phi or Phuket. Here's how I'd set it up.",
  },
  'krka': {
    description: 'My Krka National Park guide. The Skradinski Buk waterfalls, the Skradin and Lozovac entrances, where to stay, and the Sibenik base.',
    intro: "Krka National Park is the Croatian river park built around a chain of travertine waterfalls, with Skradinski Buk, the wide terraced falls, as the headline. It is an easy day trip from Split or the cathedral city of Šibenik. Go before the tour boats arrive. Here's how I'd time it.",
  },
  'kuala-lumpur': {
    description: 'My Kuala Lumpur travel guide. Thaipusam at Batu Caves, where to stay across Bangsar, KLCC, and Bukit Bintang, the Bird Park, and getting in from KLIA.',
    intro: "[Kuala Lumpur](/cities/kuala-lumpur) is the gentlest first stop in Southeast Asia: a metro that covers what matters, Grab for the rest, hotel value among the best in the region, and a cultural circuit you can do in two days. Most people leave wanting more food. Here's how I'd plan it.",
  },
  'kusttram-stations': {
    description: 'My personal guide to the Belgian coast by Kusttram. Where to stop, where to eat in Oostende, the Mercator ship, and the Oostduinkerke shrimp fishermen.',
    intro: "[Belgium](/countries/belgium)'s Kusttram is a 67-kilometer tram line running the whole length of the coast, billed as the longest in the world, and it turns the seaside into a low-stakes hop-on, hop-off tour. I wouldn't build a trip around it, but if you are already near the coast it is the easy way to find the beach town that fits. Here's my atlas of the station stops. Check [De Lijn](https://www.delijn.be) for live service.",
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
