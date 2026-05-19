/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 9 ---
  'singapore': {
    description: 'My Singapore travel guide. The Marina Bay F1 weekend, Gardens by the Bay, the hawker centers, where to stay near Robertson Quay, and the three-day version.',
    intro: "[Singapore](/cities/singapore) is the most efficient major city in Southeast Asia, and the easiest to underestimate on budget. Two or three days, mostly on foot and the MRT, with the money going on food rather than drinks. Here's how I'd plan it.",
  },
  'sitges': {
    description: 'My Sitges travel guide. The October Film Festival, February Carnival, Corpus Christi flower carpets, the beaches, and where to eat.',
    intro: "Sitges is the small beach town 40 minutes south of [Barcelona](/lists/barcelona) by Rodalies train, a calmer base near the city or an easy beach day trip from it. The hotel rates beat anything central in Barcelona and the pace is several gears slower. Here's how I'd use it, with the cava country of Penedès 30 minutes inland.",
  },
  'sofia': {
    description: 'My Sofia travel guide. Getting in from SOF, where to stay near the center, the Orthodox churches, and the Balkan-fusion restaurant scene.',
    intro: "[Sofia](/cities/sofia) is the Bulgarian capital travelers come away surprised by: brutally cheap by EU standards, a walkable center, a stack of Orthodox churches, a restaurant scene that has caught up fast, and Mount Vitosha rising right behind the city. Two or three days. Here's how I'd spend them.",
  },
  'split': {
    description: "My Split travel guide. The Diocletian's Palace walking circuit, Marjan Hill, the day trips to Hvar and Brač, where to stay, and the konobas locals use.",
    intro: "[Split](/cities/split) is the Croatian Adriatic city built inside a Roman emperor's palace, the walls now streets, the basement now wine cellars, the cathedral his mausoleum. Two days for the city, more if you are using it as a Dalmatian base. Here's how I'd plan it.",
  },
  'são-paulo': {
    description: 'My São Paulo travel guide. The world’s largest Pride parade, the steakhouses, where to stay in Jardins, the museums, and getting in from GRU.',
    intro: "[São Paulo](/cities/sao-paulo) is the South American megacity travelers visit far less than they should. The food is among the best in the Americas, the rodízio steakhouse and the world's largest Japanese diaspora both start here, and the neighborhoods read sharply distinct. Three or four days. Here's how I'd plan it.",
  },
  'tbilisi': {
    description: 'My Tbilisi travel guide. The Uber from the airport, where to stay, khinkali and qvevri amber wine, the cable car, the sulfur baths, and the markets.',
    intro: "Tbilisi might be my favorite city you have not been to: cheap once you are there, food that is excellent, an 8,000-year-old wine tradition unlike anything in a European wine bar, and architecture that flips between Parisian, Soviet, and Ottoman block by block. Three days for the city, a week with the Kakheti wine country. Here's how I'd spend it.",
  },
  'tenerife': {
    description: 'My Tenerife travel guide. Carnival in Santa Cruz, Mount Teide, the La Orotava sand carpets, the beaches, and getting in from TFS or TFN.',
    intro: "[Tenerife](/cities/tenerife) is the biggest of the Canary Islands and the volcanic Atlantic rock the rest of Europe winters on. The south is the resort-and-beach version, the north the cooler, greener, traditional side, and Mount Teide stands in the middle. Pick the end that fits the trip. Four to seven days. Here's how I'd choose.",
  },
  'the-hague': {
    description: 'My Hague travel guide. The Mauritshuis Vermeer, Escher in het Paleis, the Peace Palace, Madurodam, Scheveningen, and The Hague as a cheap base for Amsterdam.',
    intro: "[The Hague](/cities/the-hague) is the Dutch city most Netherlands itineraries skip, and the ones that do not usually wish they had given it longer. It is calmer, cheaper, and more walkable than [Amsterdam](/cities/amsterdam), with two world-class museums and a real beach 15 minutes away by tram. Rooms run far cheaper than Amsterdam's, 50 minutes up the line. Here's how I'd use it, as a 36-hour visit or a whole base.",
  },
  'tirana': {
    description: 'My Tirana travel guide. Getting in from TIA, where to stay near Skanderbeg Square, the communist-era legacy, and the modern Albanian-fusion restaurants.',
    intro: "[Tirana](/cities/tirana) is the Albanian capital that climbed onto the travel radar fast after decades of isolation. It is brutally cheap, the portions are generous, the cafe-and-rooftop culture runs late, and the Hoxha-era bunkers are still legible across the city. Two or three days, paired with the Saranda and Ksamil coast for the wider trip.",
  },
  'tokyo': {
    description: 'My Tokyo travel guide. Cherry blossom season, where to stay by trip type, the wards by train, booking Ghibli and teamLab, and the sushi rotation.',
    intro: "[Tokyo](/cities/tokyo) is the largest metro area in the world, and it reads exactly that big the moment you land. The trip is not seeing Tokyo so much as picking three or four wards and going deep on each. The food is the canonical reason. A week is the minimum. Here's how I'd plan it.",
  },
  'trogir': {
    description: 'My short Trogir travel guide. Split bus 37, Kamerlengo Castle, the green market, the resident cats, and lunch in the old town.',
    intro: "[Trogir](/cities/trogir) is a tiny walled old town so close to [Split](/cities/split) that you see it from the plane window flying in. Treat it as a clean morning with lunch, not a full-day expedition. Here's how I'd fit it in.",
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
