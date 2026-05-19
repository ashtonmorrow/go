/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 7 ---
  'medellin': {
    description: 'My Medellín travel guide. Feria de las Flores in August, the Alumbrados Christmas lights, El Poblado, the Metrocable cars, and getting in from MDE.',
    intro: "[Medellín](/cities/medellin) is the Colombian city of eternal spring, 22 to 28°C all year, and the rebuilt civic story everyone has heard about, with cable cars climbing to the hillside neighborhoods. Most people stay in El Poblado. Three or four days for the city, more with the coffee region. Here's how I'd plan it.",
  },
  'miami': {
    description: 'My Miami travel guide. South Beach and the Art Deco District, Wynwood, Little Havana, where to stay, and where to eat.',
    intro: "[Miami](/cities/miami) is a warm, Latin-inflected Florida metropolis of beaches, Art Deco, and deep Cuban and Latin American food. Most first trips fix on South Beach, but the city beyond it, Wynwood, Little Havana, is the better half. Three or four days. Here's how I'd split them.",
  },
  'milano': {
    description: 'My Milan travel guide. Fashion Week, Salone del Mobile, the Duomo and the Last Supper, aperitivo, and getting in from MXP on the Malpensa Express.',
    intro: "[Milan](/cities/milan) is northern Italy's working capital, a design-and-finance city more than a tourist one, with a small historic core and a dense modern side. It is the home of aperitivo, the Duomo, and the Last Supper. Two or three days, more if you are using it as a base for Lake Como or the Bernina Express. Here's how I'd do it.",
  },
  'montevideo': {
    description: 'My Montevideo travel guide. Carnaval, the longest in the world, the Buquebus ferry, asado at the Mercado del Puerto, and where to stay near Punta Carretas.',
    intro: "[Montevideo](/cities/montevideo) is the easy add-on to a Buenos Aires trip, 2.5 hours across the river by ferry into [Uruguay](/countries/uruguay), customs cleared at the terminal. It is a slow city: an asado lunch, an afternoon on the Rambla, a sunset over Punta Carretas. Here's how I'd spend a couple of days.",
  },
  'mostar': {
    description: 'My Mostar travel guide. The Stari Most Old Bridge and the divers, the old bazaar, where to stay, Kravica Waterfall, and where to eat.',
    intro: "[Mostar](/cities/mostar) is a small Herzegovina town on the green Neretva, built around the Stari Most, the Ottoman bridge shelled to rubble in the 1990s and rebuilt in 2004. The old core is tiny, but the buses pour in midday, so an overnight is the better trip. Here's how I'd time it.",
  },
  'munich': {
    description: 'My Munich travel guide. Oktoberfest, the Hofbräuhaus and Augustiner beer halls, the Eisbach surfers, and where to base for a rail trip.',
    intro: "Munich is the Bavarian capital most people come to for two postcards, the beer halls and the surfers on the Eisbach standing wave, and both are exactly as advertised. Two days does the city. Its real value, though, is as a rail hub, south for the Alps, east for Vienna. Here's how I'd use it.",
  },
  'nuremberg': {
    description: 'My Nuremberg travel guide. Getting in from NUE, the medieval old town, the Christmas-market case, and where to find the Nürnberger sausage.',
    intro: "[Nuremberg](/cities/nuremberg) is the medieval Franconian city that, for the German Christmas-market trip, beats Munich. An imperial castle crowns the old town, the 20th-century weight of the Nazi rallies and the post-war Trials is real and clearly told, and the little Nürnberger sausage is the food. Two or three days. Here's the shape.",
  },
  'nyc': {
    description: 'My New York City travel guide. Where to stay across the boroughs, getting in from JFK, LaGuardia, and Newark, the subway and OMNY, and where to eat.',
    intro: "New York City is too big to finish, and the first-timer mistake is trying. It is 8.5 million people across five boroughs, and a first visit, four or five days, should be built around a couple of neighborhoods and a short list of sights. Here's how I'd choose.",
  },
  'palma': {
    description: 'My Palma de Mallorca travel guide. The seafront cathedral, the old town, Bellver Castle, where to stay, the Tramuntana, and where to eat.',
    intro: "Palma is the capital of Mallorca, and most visitors treat it as nothing but the airport for the island's beaches. That skips a real Spanish city: a giant seafront cathedral, a walkable old town, a strong restaurant scene. Two or three days for Palma itself. Here's how I'd spend them.",
  },
  'panama': {
    description: 'My Panama City travel guide. Getting in from Tocumen, where to stay near Casco Viejo, the Canal, and the modern Central-American restaurant scene.',
    intro: "[Panama City](/cities/panama-city) does not feel like the rest of Central America: a Punta Pacífica skyline beside the colonial Casco Viejo, the Canal on the doorstep, and an airport that makes it a clean stopover. Two or three days for the city, more for the Canal locks or Bocas del Toro. Here's how I'd plan it.",
  },
  'pattaya': {
    description: 'My Pattaya travel guide. Getting in from Bangkok Suvarnabhumi, the resort hotels including the Andaz Jomtien, picking the right end of town, and where to eat well.',
    intro: "[Pattaya](/cities/pattaya) is the Gulf of Thailand beach-resort town two hours from Bangkok, with a reputation earned in both directions. The whole trip turns on which end you pick: the south side, Jomtien and Pratumnak, is calm and family-friendly, central Pattaya is the old nightlife circuit. Pick right and it is a fine beach base. Here's how.",
  },
  'penedes': {
    description: 'My Penedès wine guide. Getting to the wineries from Barcelona, the top cava and still-wine producers to book, and the Barcelona-Penedès-Sitges day chain.',
    intro: "Penedès is the wine country just inland from Barcelona, the home of cava, Spain's traditional-method sparkling wine, and a serious set of still wines, 30 to 45 minutes from the city. The classic move is a half-day cava tour slotted between a Barcelona morning and a Sitges sunset. Here's how I'd chain it.",
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
