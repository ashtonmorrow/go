// === sync-airports ==========================================================
// Download the OurAirports CSV and emit a slim JSON to data/airports.json
// for use by lib/airports.ts (airport panel on city pages).
//
// OurAirports is a community-maintained, public-domain catalog of every
// airport, heliport, and seaplane base in the world. We filter to large
// and medium commercial airports with scheduled service — the universe
// of "could I fly here on a normal ticket" airports. That leaves roughly
// 5,000 entries worldwide, comfortably under 2 MB as JSON.
//
// Re-run quarterly or whenever a major airport opens/closes:
//   npm run airports:sync
//
// Source: https://davidmegginson.github.io/ourairports-data/airports.csv
//
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUTPUT_DIR = resolve(__dirname, '..', 'data');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'airports.json');

type Airport = {
  ident: string;
  iata: string | null;
  name: string;
  type: 'large_airport' | 'medium_airport';
  lat: number;
  lng: number;
  elevation_ft: number | null;
  iso_country: string;
  municipality: string | null;
  wikipedia_link: string | null;
};

// Minimal RFC 4180 CSV row parser. Handles quoted fields with embedded
// commas and doubled quotes ("") as escapes. OurAirports CSV is
// well-formed; this is sufficient.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cur += c;
        i++;
      }
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
      i++;
    } else if (c === '"' && cur === '') {
      inQuotes = true;
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  fields.push(cur);
  return fields;
}

async function main(): Promise<void> {
  console.log('[airports] downloading', SOURCE_URL);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const lines = text.split('\n').filter(l => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`missing column: ${name}`);
    return i;
  };

  const idxIdent = idx('ident');
  const idxIata = idx('iata_code');
  const idxName = idx('name');
  const idxType = idx('type');
  const idxLat = idx('latitude_deg');
  const idxLng = idx('longitude_deg');
  const idxElev = idx('elevation_ft');
  const idxCountry = idx('iso_country');
  const idxMuni = idx('municipality');
  const idxWiki = idx('wikipedia_link');
  const idxService = idx('scheduled_service');

  const airports: Airport[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const type = fields[idxType];
    if (type !== 'large_airport' && type !== 'medium_airport') continue;
    if (fields[idxService] !== 'yes') continue;

    const lat = parseFloat(fields[idxLat]);
    const lng = parseFloat(fields[idxLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const rawIata = fields[idxIata] || '';
    const iata = rawIata.length === 3 ? rawIata.toUpperCase() : null;
    const elev = parseFloat(fields[idxElev]);

    airports.push({
      ident: fields[idxIdent],
      iata,
      name: fields[idxName],
      type: type as 'large_airport' | 'medium_airport',
      lat,
      lng,
      elevation_ft: Number.isFinite(elev) ? elev : null,
      iso_country: fields[idxCountry],
      municipality: fields[idxMuni] || null,
      wikipedia_link: fields[idxWiki] || null,
    });
  }

  // Sort by ICAO ident for stable diffs on re-sync.
  airports.sort((a, b) => a.ident.localeCompare(b.ident));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(airports));

  const sizeKb = (JSON.stringify(airports).length / 1024).toFixed(0);
  const large = airports.filter(a => a.type === 'large_airport').length;
  const medium = airports.filter(a => a.type === 'medium_airport').length;
  console.log(
    `[airports] wrote ${airports.length} airports (${large} large + ${medium} medium), ${sizeKb} KB`,
  );
  console.log(`[airports] output: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('[airports] failed:', err);
  process.exit(1);
});
