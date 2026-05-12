// === City arrival data =====================================================
//
// Per-city airport and arrival facts used to scaffold the "Getting in from
// the airport" section of city-anchored list guides. Each row carries the
// IATA code, full airport name, approximate distance/time to the city
// centre, and the typical options ranked the way I would actually take
// them (rideshare/taxi first for tired arrivals, transit second when
// price matters and luggage is manageable, dedicated airport bus or
// train where one exists).
//
// The data is intentionally kept loose; the per-city sections in the
// list guides are the place to add lived gotchas (the London tap-out
// rule, the Italian regional-ticket validation step, etc.). This table
// is the structural source of truth so a guide that does not yet have
// an arrival section can be scaffolded consistently.
//
// To add a new city: append an entry keyed by the same slug used in
// go_cities. Once the entry exists, scripts/scaffold-city-arrival.ts
// (or future equivalents) can read it.

export type CityArrival = {
  /** The primary commercial airport. */
  airport: {
    iata: string;
    name: string;
    /** Approximate distance from airport terminal to the city centre. */
    distanceKm: number;
    /** Typical drive time at a normal hour. */
    driveTimeMin: [number, number];
  };
  /** Transit and ride options, ranked by what I would actually pick first. */
  options: ArrivalOption[];
  /** One-line context for the arrival section's opening sentence. Should
   *  read naturally after the city name; e.g., "is small and the rideshare
   *  market is healthy". */
  contextSentence: string;
};

export type ArrivalOption = {
  /** Short label: "Uber / Bolt", "S-Bahn S1 / S8", "Aerobús", etc. */
  mode: string;
  /** Time door to centre. */
  timeMin: [number, number];
  /** Approximate cost in local currency or a usd-equivalent band. */
  cost: string;
  /** When to actually pick it. */
  bestFor: string;
};

export const CITY_ARRIVAL: Record<string, CityArrival> = {
  'cape-town': {
    airport: {
      iata: 'CPT',
      name: 'Cape Town International',
      distanceKm: 20,
      driveTimeMin: [25, 40],
    },
    contextSentence:
      'sits about 20 km east of the City Bowl and is the gateway for almost every international visitor; the road in is straightforward but the airport-to-Cape-Town shuttle market has a few traps worth avoiding',
    options: [
      {
        mode: 'Uber / Bolt',
        timeMin: [25, 40],
        cost: 'R250 to R400 to the City Bowl, R350 to R500 to Camps Bay',
        bestFor: 'The default for most arrivals with luggage. Both apps work from a marked pickup zone outside arrivals; the pin moves occasionally so check the in-app map',
      },
      {
        mode: 'MyCiTi airport bus (A1)',
        timeMin: [40, 60],
        cost: 'R110 plus a one-off R39 myconnect card load',
        bestFor: 'A clean public-transit option to the central Civic Centre on Hertzog Boulevard. Slower with luggage but a fraction of the rideshare cost',
      },
      {
        mode: 'Pre-booked transfer',
        timeMin: [25, 40],
        cost: 'R450 to R700 depending on operator',
        bestFor: 'Late arrivals when you do not want to deal with the app at 23:00; ask your hotel to arrange. Slightly more expensive than Uber but the driver waits at arrivals with a name board',
      },
      {
        mode: 'Metered taxi from the rank',
        timeMin: [25, 40],
        cost: 'Negotiated; typically R400 to R500',
        bestFor: 'Last resort. Agree the price before you get in; the metered rate is rarely actually run on the meter',
      },
    ],
  },

  'chiang-mai': {
    airport: {
      iata: 'CNX',
      name: 'Chiang Mai International',
      distanceKm: 5,
      driveTimeMin: [10, 20],
    },
    contextSentence:
      'sits about 5 km southwest of the old city walls; the ride into town is short enough that the option you pick matters less than it does for most airports',
    options: [
      {
        mode: 'Grab',
        timeMin: [10, 20],
        cost: '120 to 200 THB to most of the old city or the Nimman area',
        bestFor: 'The default with luggage. Pickup is a marked rideshare lot a short walk from arrivals; the app shows the bay number',
      },
      {
        mode: 'Airport taxi from the rank',
        timeMin: [10, 20],
        cost: '150 THB flat fare to most of central Chiang Mai',
        bestFor: 'Useful when Grab is surging or the app is glitching. Queue at the marked counter inside arrivals; you pay the desk and they hand you a slip for the driver',
      },
      {
        mode: 'Songthaew (red truck)',
        timeMin: [15, 30],
        cost: '40 to 80 THB per person, shared',
        bestFor: 'A casual local option if you are travelling light and not in a hurry. Drivers wait outside arrivals; agree the price before you load luggage',
      },
    ],
  },

  'munich': {
    airport: {
      iata: 'MUC',
      name: 'Munich Airport',
      distanceKm: 35,
      driveTimeMin: [40, 60],
    },
    contextSentence:
      'sits about 35 km north-east of the Hauptbahnhof and is well-connected by S-Bahn; the train is the practical default unless you have heavy luggage or a late arrival',
    options: [
      {
        mode: 'S-Bahn S1 or S8',
        timeMin: [40, 50],
        cost: '€13.50 single, or €15.50 day pass that also covers Munich-area transit',
        bestFor: 'The default. Both lines run from the airport (one terminal-side platform serves both) to Hauptbahnhof, Marienplatz, and Ostbahnhof every 10 minutes. Roughly the same time either way; S1 swings west, S8 swings east',
      },
      {
        mode: 'Lufthansa Express Bus',
        timeMin: [45, 60],
        cost: '€13 single',
        bestFor: 'Direct to Hauptbahnhof with luggage racks. Less frequent than the S-Bahn but a single seat the whole way',
      },
      {
        mode: 'Uber / FreeNow / taxi',
        timeMin: [40, 60],
        cost: '€65 to €90 to the centre',
        bestFor: 'Late arrival, heavy luggage, or a group splitting the fare. The taxi rank outside arrivals is reliable; Uber and FreeNow work too but pickup happens at a marked lot a short walk from the terminal',
      },
    ],
  },

  'valletta': {
    airport: {
      iata: 'MLA',
      name: 'Malta International Airport',
      distanceKm: 8,
      driveTimeMin: [20, 30],
    },
    contextSentence:
      'sits about 8 km south of Valletta and even closer to the St Julian\'s hotel strip where most travellers actually stay; the ride in is short and the rideshare market is healthy',
    options: [
      {
        mode: 'Uber / Bolt',
        timeMin: [20, 25],
        cost: '€15 to €25 to St Julian\'s or Valletta',
        bestFor: 'The right default. Pickup is a short walk from arrivals at a marked lot; the apps work cleanly. Reasonable for the distance and worth it after a long flight',
      },
      {
        mode: 'X2 bus to St Julian\'s, X4 to Sliema, X3 to Valletta',
        timeMin: [30, 50],
        cost: '€2 single (€3 in summer night service)',
        bestFor: 'Cheap and frequent during the day. Slower with luggage and the bus stops are a short walk from many hotels; works if you are travelling light',
      },
      {
        mode: 'Taxi from the rank',
        timeMin: [20, 25],
        cost: '€25 to €35 (fixed-rate zones)',
        bestFor: 'Marked yellow-and-black cars at the kerb; pay at the desk inside arrivals before you board so the fare is the printed zone rate rather than a negotiation',
      },
    ],
  },
};

/** Render the arrival data for a city slug as the markdown body of a
 *  "Getting in from the airport" section. The section's H2 heading is
 *  added by the caller so the insertion point can decide whether to
 *  include a leading newline or list link in the on-page TOC. */
export function renderArrivalSectionBody(slug: string, cityDisplayName: string): string | null {
  const data = CITY_ARRIVAL[slug];
  if (!data) return null;

  const { airport, options, contextSentence } = data;
  const rows = options
    .map(o =>
      `| ${o.mode} | ${o.timeMin[0]} to ${o.timeMin[1]} min | ${o.cost} | ${o.bestFor} |`,
    )
    .join('\n');

  return `${cityDisplayName} ${airport.name} (${airport.iata}) ${contextSentence}.

| Mode | Time | Cost | When to use |
|---|---|---|---|
${rows}

`;
}
