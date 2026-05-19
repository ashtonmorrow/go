/**
 * One-shot (run per batch): rewrite the frontmatter `description` and the
 * body intro paragraph of list guides into Mike's first-person voice.
 * Pure text replacement; preserves the in-frontmatter authoring comments.
 * Run with --write to apply.
 */
import fs from 'fs';
import path from 'path';

const REWRITES: Record<string, { description: string; intro: string }> = {
  // --- batch 8 ---
  'phi-phi': {
    description: 'My Koh Phi Phi travel guide. The ferry from Phuket or Krabi, where to eat on Tonsai, Maya Bay, and the no-cars island lifestyle.',
    intro: "[Koh Phi Phi](/cities/koh-phi-phi) is the small Thai island that blew up after The Beach and has been managing the crowds ever since. No cars, no airport, you arrive by ferry from Phuket or Krabi. Two or three days is the right shape, longer only if you really want the island pace. Here's how I'd do it.",
  },
  'phuket': {
    description: 'My Phuket travel guide. Where to stay in Patong, Kamala, or Kata, the beach pecking order, the Big Buddha cultural day, and Phi Phi as a side trip.',
    intro: "[Phuket](/cities/phuket) is the practical Thai island: the international airport, every grade of hotel, the tour boats to Phi Phi and Phang Nga, and the bluntest version of beach tourism in Thailand. That is not a complaint. Match the side of the island to the trip you want. Here's how I'd do it.",
  },
  'playa-del-carmen': {
    description: 'My Playa del Carmen travel guide. Getting in from Cancún, where to stay near Quinta Avenida, the cenotes, and the casual Yucatán restaurants.',
    intro: "[Playa del Carmen](/cities/playa-del-carmen) grew from a sleepy Cozumel ferry stop into a full Yucatán resort town, strung along the Quinta Avenida pedestrian strip with white Caribbean sand at its edge. The cenotes and Mayan ruins are the depth. Three to five days, more with Tulum or Cozumel. Here's how I'd plan it.",
  },
  'prague': {
    description: 'My Prague travel guide. The Christmas markets on Old Town Square, the Prague Spring music festival, where to stay, and getting in from PRG.',
    intro: "[Prague](/cities/prague) is the Bohemian capital and one of the most walkable old towns in Europe, the Vltava splitting it between the Old Town and the castle side. A long weekend covers the headliners, a week opens the smaller neighborhoods. Here's how I'd plan it.",
  },
  'rennes': {
    description: 'My Rennes travel guide. The half-timbered old town, the huge Saturday market at Place des Lices, where to stay, and where to eat.',
    intro: "[Rennes](/cities/rennes) is the capital of Brittany, a lively university city with a compact old town of leaning half-timbered houses and one of the biggest food markets in France. A day or two does it. Here's how I'd spend it.",
  },
  'rio': {
    description: 'My Rio de Janeiro travel guide. Carnival logistics, Réveillon at Copacabana, where to stay in Ipanema, the beaches, and getting in from GIG.',
    intro: "[Rio de Janeiro](/cities/rio-de-janeiro) is the Brazilian city where the geography is the whole point, the Atlantic on one side, granite peaks on the other, the beaches and the lagoon between. Most people stay around Ipanema and Copacabana. A long weekend works Rio-only, a week opens the coast. Here's how I'd plan it.",
  },
  'rome': {
    description: 'My Rome travel guide. The Leonardo Express from FCO, where to stay near the center, the real pasta spots, and the four Roman pastas to track down.',
    intro: "[Rome](/cities/rome) built the template every other European capital copies, and the ancient sights really are as good as advertised. The other half of the trip is the Roman pasta canon, which most first-timers miss by booking tourist restaurants near the monuments. A long weekend minimum. Here's how I'd do it right.",
  },
  'rotterdam': {
    description: 'My Rotterdam travel guide. The Markthal and Cube Houses loop, Depot Boijmans, the Euromast, Hotel New York, and Kinderdijk as a day trip.',
    intro: "[Rotterdam](/cities/rotterdam) is the architectural counterpoint to Amsterdam: WWII bombing erased the medieval city, and the rebuild turned it into the proving ground for modern Dutch architecture. Two days for the walking loop and the food, plus a half-day at Kinderdijk. Here's how I'd plan it.",
  },
  'santiago-chile': {
    description: 'My short Santiago travel guide. Where to stay across Providencia, Bellavista, and Lastarria, Cerro San Cristóbal, the Maipo Valley wineries, and a Valparaíso day trip.',
    intro: "[Santiago](/cities/santiago) is an easy South American capital to plan: a metro that covers what you need, more food depth than its businesslike reputation suggests, wine country within an hour, and the Andes on the skyline. Four or five days as a base, or one anchor of a longer Chile loop. Here's how I'd use it.",
  },
  'sarajevo': {
    description: 'My Sarajevo travel guide. The Sarajevo Film Festival in August, Baščaršija Nights, where to stay, and getting in from SJJ.',
    intro: "[Sarajevo](/cities/sarajevo) carries an outsized amount of history in a small walkable center: Habsburg buildings on one side, an Ottoman bazaar on the other, and the 1990s siege still legible in the architecture and in the people you meet. That last part is not background, it is the story most visitors come to understand. Two or three days. Here's the shape.",
  },
  'saranda-_-ksamil': {
    description: 'My Saranda and Ksamil travel guide. The ferry from Corfu, where to stay on the Albanian Riviera, and the beach restaurants worth the trip.',
    intro: "[Saranda](/cities/saranda) and [Ksamil](/cities/ksamil) are the southern Albanian Riviera, crystal water and limestone coves at half the price of Greece across the strait. Saranda is the larger town, Ksamil the photogenic beach-resort version 20 minutes south. Three or four days for the pair. Here's how I'd split them.",
  },
  'seoul': {
    description: 'My Seoul travel guide. Getting in from Incheon on the AREX, where to stay by neighborhood, the Joseon palaces, Bukchon, and the night markets.',
    intro: "[Seoul](/cities/seoul) is a ten-million-person capital that somehow feels easy, five-hundred-year-old palaces a few subway stops from glass towers and all-night markets, all knit together by a metro you can read from the first ride. A first trip is four or five days. Here's how I'd pick the neighborhoods.",
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
