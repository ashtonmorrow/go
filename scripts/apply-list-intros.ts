/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 *
 * Pure text replacement (no gray-matter round-trip) so the in-frontmatter
 * authoring-note comment blocks are preserved. The body intro is defined
 * as everything between the closing frontmatter fence and the first
 * `\n## ` heading; it is replaced wholesale.
 *
 * The REWRITES map is overwritten per batch. Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 2 ---
  'belgrade': {
    description: 'My Belgrade travel guide. Getting in from Nikola Tesla, where to stay near the center, and the Serbian-cooking restaurants worth the trip.',
    intro: "[Belgrade](/cities/belgrade) is rougher than the polished European capitals, and that's exactly why I like it. It sits where the Sava meets the Danube, with a fortress over the old town and a food-and-nightlife scene that runs late. Two or three days does it, and it pairs cleanly with Sarajevo and Mostar.",
  },
  'benidorm': {
    description: 'My Benidorm travel guide. The Levante and Poniente beaches, the Old Town, getting in from Alicante, where to stay, and where to eat.',
    intro: "Benidorm is a wall of high-rises behind two long sandy beaches, one of Europe's busiest package-holiday towns, and it is exactly what it says it is. I won't oversell it: come for the beach, the sun, and the cheap nights out. Here's how I'd do a few days.",
  },
  'berlin': {
    description: 'My Berlin travel guide. Berlinale tickets, the Christmas markets, where to stay, where to find the best döner, and getting in from BER on the S-Bahn.',
    intro: "[Berlin](/cities/berlin) plays by its own rules: less polished than Paris, less rich than London, and carrying a rougher cultural energy the other two lost decades ago. It is huge, the transit is superb, and nobody does Turkish-German food better. A long weekend gets the headline sights. A week gets the neighborhoods.",
  },
  'bernina-express-route': {
    description: 'My notes on riding the Bernina Express through the Alps. The regional connection from Milan to Tirano, the panoramic train, the booking traps, and Chur at the end.',
    intro: "The Bernina Express is the scenic train that climbs through the Alps from [Tirano](/cities/tirano) in Italy to [Chur](/cities/chur) in Switzerland, and it is easier to slot into a Milan trip than the map suggests. I booked mine less than a week out. Here are my notes on doing the same: the regional connection from Milan, the booking traps, and what the panoramic windows are actually worth.",
  },
  'bogota': {
    description: 'My Bogotá travel guide. Getting in from El Dorado, where to stay near Zona T, the restaurants worth booking, and what to know about the altitude.',
    intro: "[Bogotá](/cities/bogota) gets a layover when it deserves a few days. It surprises people: the altitude you feel on day one, cool mountain weather all year, and a modern restaurant scene built since the 2000s. Three or four days for the city, more if you are adding the coffee region or Cartagena.",
  },
  'brighton': {
    description: 'My Brighton travel guide. The hour-long train from London, the seafront and the pier, the Royal Pavilion, the Lanes, and where to eat by the sea.',
    intro: "[Brighton](/cities/brighton) is the easiest day at the sea from London, an hour down the line, and the most relaxed, openly bohemian city in England, the country's unofficial LGBTQ+ capital and a proper arts town. It is built for walking: the pebble beach, the Palace Pier, the Royal Pavilion, the independent-shop lanes. Here's how I'd spend a day, or better, an overnight.",
  },
  'bristol': {
    description: 'My Bristol travel guide. Glastonbury logistics, the Banksy walking tour, where to stay, Clifton, and the London-Bristol-Bath loop.',
    intro: "I think [Bristol](/cities/bristol) doesn't get enough love. It is the underrated half of a London week, a direct sub-two-hour train from Paddington to [Bristol Temple Meads](/pins/bristol-temple-meads) and the natural anchor for a London, Stonehenge, Bristol, and Bath loop that needs no car. Here's how I'd use a weekend there.",
  },
  'bruges': {
    description: 'My Bruges travel guide. The UNESCO old town, the De Halve Maan brewery, the chocolate stops, the Béguinage, and day trip versus overnight from Brussels.',
    intro: "[Bruges](/cities/bruges) is the small medieval Belgian city everyone tells you to see, and they are right, but only if you beat the day-trippers. The historic center is one walkable loop of canals, chocolate, and a brewery. Get there before 10 a.m. or after 6 p.m. and the crowds thin to almost nothing. Here's how I'd do it.",
  },
  'bucharest': {
    description: 'My Bucharest travel guide. Getting in from Henri Coandă, where to stay in the Old Town, and the restaurants worth booking around.',
    intro: "[Bucharest](/cities/bucharest) is a slow burn. Travelers do not expect to like it and often end up liking it more than Europe's famous cities, for the dense walkable Old Town, a food scene rebuilt since the 2000s, and that unmistakable brutalist weight. Two or three days for the city, then pair it with Transylvania.",
  },
  'budapest': {
    description: 'My Budapest travel guide. Sziget Festival, the thermal baths (Gellért, Széchenyi, Rudas), where to eat, and getting in from BUD.',
    intro: "[Budapest](/cities/budapest) is two cities the Danube splits: hilly, quiet Buda on the west, flat and busy Pest on the east where you will stay. The thermal baths are its signature, and the food has caught up hard in the last decade. Here's how I'd plan it. The baths get their own writeup in my [spa-day list](/lists/spa-day).",
  },
  'budva': {
    description: 'My Budva travel guide. The walled Old Town, the Budva Riviera beaches, Sveti Stefan, where to stay, and where to eat.',
    intro: "[Budva](/cities/budva) is a small walled Old Town wrapped in a loud beach resort, the busiest stretch of the Montenegrin coast. Two or three days covers it, and its real value is as a base for the rest of the coast, Kotor and Sveti Stefan included. Here's how I'd play it.",
  },
  'buenos-aires': {
    description: 'My Buenos Aires travel guide. Tango BA Festival, Don Julio and the parrilla, where to stay in Palermo, and getting in from EZE or AEP.',
    intro: "[Buenos Aires](/cities/buenos-aires) is the South American capital I send people to first, all European-style boulevards, parrilla steakhouse culture, and a peso economy that keeps shifting what your dollars are worth. Give it a week, more if you are adding Mendoza, Iguazú, or Patagonia.",
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
