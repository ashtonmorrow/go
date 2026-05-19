/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 10 (final) ---
  'ulm': {
    description: "My Ulm travel guide. The Minster and its world-record spire, the Fishermen's Quarter, where to stay, the Danube, and where to eat.",
    intro: "[Ulm](/cities/ulm) has the tallest church spire in the world, and that single fact carries the trip. Below the Minster sits a pretty half-timbered old town on the Danube, easy to see in a day on the fast line between Stuttgart and Munich. Here's how I'd spend it.",
  },
  'utrect-nl': {
    description: 'My Utrecht travel guide. The train from Schiphol or Amsterdam, where to stay near Centraal, the Dom Tower, and the casual Dutch restaurants.',
    intro: "[Utrecht](/cities/utrecht) is the small Dutch university city that keeps getting under-recommended next to Amsterdam, and that is its appeal: the same canal-laced center at a third the size and a quarter the crowds, under the tallest medieval church tower in the country. Two or three days. Here's how I'd spend them.",
  },
  'valencia': {
    description: 'My Valencia travel guide. The old town and the Mercat Central, the City of Arts and Sciences, the Turia gardens, where to stay, and where to eat.',
    intro: "[Valencia](/cities/valencia) is Spain's easygoing third city, a walkable old town, a futuristic arts complex, and a former riverbed turned into a park that loops the whole center. It is the birthplace of paella. Two or three days. Here's how I'd spend them.",
  },
  'venezia': {
    description: 'My Venice travel guide. Carnevale, the Biennale, the Film Festival on the Lido, where to stay inside the lagoon, and getting in from VCE on the Alilaguna.',
    intro: "[Venice](/cities/venice) gets a bad-faith reputation it does not earn. Yes, San Marco is crowded and the cruise day-trippers are real, but the rest of the city, Cannaregio, Dorsoduro, the quiet end of Castello, is calm and exactly what the postcards promise. The whole difference is staying overnight inside the lagoon instead of day-tripping in. Two or three nights minimum.",
  },
  'venlo': {
    description: 'My Venlo travel guide. The Renaissance town hall, the old center, getting in, where to stay, and where to eat.',
    intro: "[Venlo](/cities/venlo) is a small, easygoing Dutch town in Limburg, right on the German border, with a Renaissance town hall and a walkable old center. Half a day to a day covers it, best slotted into a wider Limburg or cross-border trip. Here's how I'd use it.",
  },
  'verona': {
    description: "My Verona travel guide. The Roman Arena and the opera festival, the old town, Juliet's House, where to stay, and where to eat.",
    intro: "Verona is a Roman arena, a summer opera season, and the Romeo and Juliet myth, packed into a UNESCO old town on a bend of the Adige. A day or two covers it, slotted neatly between Venice and Milan. Here's how I'd spend it.",
  },
  'vienna': {
    description: 'My Vienna travel guide. The winter ball season, the Christmas markets, the coffee houses, where to stay near the Ring, and Therme Wien.',
    intro: "[Vienna](/cities/vienna) still reads like an imperial capital: the Ringstrasse grandeur, the Habsburg architecture, the two-century coffee-house habit, the music of Mozart and Beethoven. A long weekend covers the headline sights, a week opens the Vienna Woods and the wine villages. Here's how I'd plan it.",
  },
  'york': {
    description: 'My York travel guide. Getting in from London by train, the walled medieval city on foot, the Jorvik and railway museums, and the pub-and-tea-room food.',
    intro: "[York](/cities/york) is the walled cathedral city of northern England, a compact medieval core inside a near-complete circuit of stone walls, layered over Roman and Viking ground. It works as a long day trip from London, but it is better as an overnight, since the day-tripper only ever sees the busy mid-afternoon version. Here's how I'd do it.",
  },
  'zagreb': {
    description: "My Zagreb travel guide. The Upper Town and St. Mark's Church, Dolac market, the cafe culture, where to stay, and where to eat.",
    intro: "[Zagreb](/cities/zagreb) is the Croatian capital travelers skip on the way to the coast, which is their loss: a relaxed, walkable Central European capital with a hilltop old town, a great open-air market, and a coffee culture that is a local institution. A day or two covers it. Here's how I'd spend it.",
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
