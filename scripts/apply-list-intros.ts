/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 6 ---
  'larnaca': {
    description: 'My Larnaca travel guide. Getting in from LCA, the gateway airport for Cyprus, where to stay near Finikoudes, and the kebab-and-taverna food.',
    intro: "[Larnaca](/cities/larnaca) is the small Cypriot port most visitors pass straight through, on their way to Limassol or Ayia Napa, and it rewards staying instead. A seafront promenade, a medieval castle, a mosque on a salt lake, and good cheap tavernas make it a calmer base than the resort towns. Two or three days. Here's how I'd use them.",
  },
  'lima': {
    description: 'My Lima travel guide. Where to stay in Miraflores and Barranco, the ceviche and Nikkei food scene, the historic center, the Larco Museum, and the markets.',
    intro: "[Lima](/cities/lima) gets a single night from most travelers, a layover on the way to Cusco, and that sells it badly short. It is one of the best eating cities in the world, strung along desert cliffs over the Pacific. Give it two or three days. Here's how I'd spend them.",
  },
  'lisbon': {
    description: 'My Lisbon travel guide. Getting in from Humberto Delgado on the metro, where to stay near the center, the tascas, and the side trips to Sintra and Cascais.',
    intro: "[Lisbon](/cities/lisbon) has been on every must-visit list for a decade, and the reasons hold up on arrival: the light, the trams, the food, hotels you can afford, and seven hills that turn every corner into a viewpoint. A long weekend gets the headlines, a week unlocks Sintra and Cascais. Here's how I'd plan it.",
  },
  'liverpool': {
    description: "My Liverpool travel guide. The Albert Dock waterfront, the Beatles sites, where to stay, the two cathedrals, and the food and bar scene.",
    intro: "[Liverpool](/cities/liverpool) has more going for it than its tourist reputation lets on, a compact, walkable port city with one of Britain's best waterfronts and a real food-and-bar scene under the Beatles industry. Two days, three if you want a football match. Here's how I'd do it.",
  },
  'london': {
    description: 'My London travel guide. Where to stay across Canary Wharf, Tower Hill, and Kensington, the Bankside walk, the markets worth eating at, and the Sky Garden.',
    intro: "[London](/cities/london) is the easiest world city to plan and the easiest to overspend on. The transport is the best part of the trip, the markets are the best places to eat, and most of the famous sights are walkable in two long days. Where people overspend is an expensive base they don't need and views they could see for free. Here's how I'd do it.",
  },
  'lpq': {
    description: 'My Luang Prabang travel guide. The old town and temples, Mount Phousi, Kuang Si Falls, the night market, where to stay, and where to eat.',
    intro: "[Luang Prabang](/cities/luang-prabang) is the small Lao town on a peninsula between two rivers, a UNESCO old town of gilded temples and French colonial shophouses that runs at a deliberately slow pace. Three or four days, and you will want to slow down to match it. Here's how I'd spend them.",
  },
  'lyon': {
    description: 'My Lyon travel guide. Fête des Lumières in December, Nuits de Fourvière in the Roman theaters, the bouchons, and getting in from LYS.',
    intro: "[Lyon](/cities/lyon) takes its claim to be the food capital of France seriously, and the bouchon, the small casual Lyonnais restaurant, is the local proof. Add a UNESCO old town between two rivers and you have an easy two or three days. Here's how I'd eat my way through it.",
  },
  'madrid': {
    description: 'My Madrid travel guide. Where to stay, an El Rastro Sunday, the Mercado de San Miguel trap, Reina Sofía over the Prado, and Templo de Debod at sunset.',
    intro: "[Madrid](/cities/madrid) is easy to recommend and easy to mis-plan. The neighborhoods sit close together, the food rewards walking, and the transport works the way you want it to. Where people go wrong is the base, the famous market they treat as a meal, and walking up to the [Prado](/pins/paseo-del-prado-and-buen-retiro-a-landscape-of-arts-and-sciences) on a Saturday. Here's how I'd get it right.",
  },
  'malaga': {
    description: 'My Málaga travel guide. Getting in from AGP, the Costa del Sol shape, the Picasso museum, the Alcazaba, and a casual Andalusian food rotation.',
    intro: "[Málaga](/cities/malaga) keeps reading better year after year, a small, walkable Andalusian old town dense with tapas bars, city beaches right there, a Moorish fortress on the hill, and the Picasso museum in the painter's birthplace. Two or three days for the city, more with the Costa del Sol. Here's how I'd plan it.",
  },
  'malta': {
    description: 'My Malta travel guide. The St Julian’s hotel strip, walking Valletta, Gozo by ferry, rabbit and where to eat, and the high-versus-low season tradeoff.',
    intro: "Malta is the smallest country in the EU, and that is the planning fact everything depends on: 27 km long, a single base covers it. Stay on the St Julian's strip, then ferry, bus, and walk to [Valletta](/pins/valletta), the Three Cities, Gozo, and a swim at Comino. Three or four nights, and a meal with rabbit at least once.",
  },
  'manchester': {
    description: 'My Manchester travel guide. Getting in from MAN, where to stay near the Northern Quarter, the curry mile, and the modern Manc restaurant scene.',
    intro: "[Manchester](/cities/manchester) is the northern English industrial city that has been reinventing itself fast since the 2000s. The Northern Quarter carries the new bar-and-restaurant scene, Rusholme's curry mile carries the food it is famous for, and a United match or a Liverpool day trip stretches it to a week. Two or three days otherwise.",
  },
  'marrakech': {
    description: 'My Marrakech travel guide. Where to stay in a riad, the medina and souks, Jemaa el-Fnaa, the palaces and gardens, and the faux-guide scams.',
    intro: "[Marrakech](/cities/marrakesh) is a Moroccan city at the foot of the High Atlas, and the part you came for is all inside the walls of the medieval medina: the souks, Jemaa el-Fnaa, the palaces, the riads down car-free lanes. Three or four days, one saved for the mountains. Here's how I'd handle it, scams included.",
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
