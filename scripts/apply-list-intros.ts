/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 3 ---
  'cabo-verde': {
    description: "My short Cabo Verde guide. Picking your island between Sal, São Vicente, Santo Antão, and Fogo, the volcanic crater village, Mindelo's music, and inter-island travel.",
    intro: "[Cabo Verde](/countries/caboverde) is the archipelago travelers can't quite place: ten volcanic islands in the Atlantic off West Africa, Portuguese and Kriolu speaking, trade winds year-round. The whole trip is really one decision, which island. Here's how I'd choose between Sal, São Vicente, Santo Antão, and Fogo.",
  },
  'cairo': {
    description: 'My Cairo travel guide. The airport hotel on points, where to stay in Giza, doing the pyramids DIY, and the scams to know going in.',
    intro: "Cairo asks more of you than most cities: 22 million people, three thousand years of history layered on the streets, and real hustle at the pyramids. I don't book tours, so these are my DIY notes, an airport hotel on points, an Uber to the plateau gate at 7 a.m., the Grand Egyptian Museum after the heat. Go anyway. Few cities give back more.",
  },
  'cape-town': {
    description: 'My Cape Town travel guide. Where to stay, climbing Table Mountain, the Boulders penguins and Cape Peninsula, the Winelands, and planning around the weather.',
    intro: "[Cape Town](/cities/cape-town) is not a city I'd plan casually. The setting sells itself, [Table Mountain](/pins/table-mountain-national-park) over the city bowl, two oceans, the Winelands within reach, but the city rewards planning around safety, weather, and where you sleep. I spent a few weeks there. Here's what I learned.",
  },
  'cardiff': {
    description: 'My Cardiff travel guide. Cardiff Castle and the Victorian arcades, Cardiff Bay, where to stay, the rugby at the Principality Stadium, and the food.',
    intro: "Cardiff is the Welsh capital you can cross on foot in half an hour: a castle in the middle, a regenerated bay, and a stadium that drops 70,000 rugby fans into the center on a match day. A day or two does it, alone or as the anchor for a wider Wales trip. Here's how I'd spend it.",
  },
  'cartagena-colombia': {
    description: 'My Cartagena travel guide. Getting in from CTG, where to stay in the walled city, and the ceviche-and-rooftop rotation worth the heat.',
    intro: "[Cartagena](/cities/cartagena) does the walled colonial old town better than almost anywhere in the Americas, a dense, photogenic Ciudad Amurallada on the Colombian Caribbean. The heat is relentless and shapes the whole day. Two or three days is right. Here's how I'd handle them.",
  },
  'cdmx': {
    description: 'My Mexico City travel guide. Where to stay in Roma and Condesa, the historic center, the museums, the Teotihuacan pyramids, and the food scene.',
    intro: "Mexico City is one of the great food cities on earth, and far easier and more rewarding than its reputation suggests. It is huge, it sits at 2,240 meters in a ring of mountains, and a first trip wants four or five days across a couple of neighborhoods. Here's how I'd plan it.",
  },
  'chiang-mai': {
    description: 'My Chiang Mai travel guide. Yi Peng sky lanterns in November, the Old City temples, khao soi, and where to base yourself.',
    intro: "[Chiang Mai](/cities/chiang-mai) is the calm half of a Thailand trip: where Bangkok is heat and noise, this is temples and a long lunch, with the mountains starting at the edge of town. The food, by most measures, beats Bangkok's. If Thailand is already the plan, give it three or four days.",
  },
  'cologne': {
    description: 'My Cologne travel guide. The cathedral, the Old Town and the Rhine, Kölsch and the brewhouses, where to stay, and where to eat.',
    intro: "[Cologne](/cities/cologne) is a giant Gothic cathedral with a city attached, one of Germany's oldest, sat on the Rhine and running on its own pale beer. A day or two covers it. Here's how I'd use the time, brewhouses included.",
  },
  'cordoba-ar': {
    description: 'My short Córdoba (Argentina) travel guide. The Cosquín Folklore Festival in January, the colonial center, college-town nightlife, and the Sierras.',
    intro: "[Córdoba, Argentina](/cities/cordoba-ar) is the city most visitors fly past, skipped for Buenos Aires and a hassle to reach. It is worth more than that: a five-hundred-year-old colonial center and a college town where dinner is at 10 and the bars get going at 2. Here's what I'd do with a few days.",
  },
  'delft': {
    description: 'My Delft travel guide. The canal center between Rotterdam and The Hague, the Markt and its two great churches, the blue pottery, and where to eat.',
    intro: "[Delft](/cities/delft) is the quiet canal town wedged between Rotterdam and The Hague, the place that gave the world Vermeer and the blue-and-white pottery. The historic center is small, flat, and walkable end to end in an afternoon. It is one of the easiest day trips in the Netherlands. Here's how I'd spend it.",
  },
  'djerba': {
    description: "My short Djerba travel guide. When to visit Tunisia's Mediterranean island, where to stay, the beaches, El Ghriba synagogue, and the Djerbahood murals.",
    intro: "Djerba is the [Tunisian](/countries/tunisia) island most North Americans have never heard of, though European package travelers have known it for thirty years. Cheap Mediterranean sand, plus a 14th-century synagogue, a street-art village, and a desert-edge Berber day trip. Two or three days do not run thin. Here's how I'd do it.",
  },
  'dublin': {
    description: "My Dublin travel guide. St Patrick's Day logistics, where to stay near the center, the pub-and-restaurant rotation, and getting in from DUB.",
    intro: "[Dublin](/cities/dublin) runs on its pubs, its writers, and a rebuilding energy that has not let up since 2008. The Liffey splits it, and almost everyone stays south of the river. A long weekend covers the city, a week opens up Howth and the Wicklow Mountains. Here's how I'd plan it.",
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
