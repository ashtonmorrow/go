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

  'amsterdam': {
    airport: {
      iata: 'AMS',
      name: 'Amsterdam Airport Schiphol',
      distanceKm: 9,
      driveTimeMin: [15, 20],
    },
    contextSentence:
      'sits about 9 km southwest of Centraal and is one of the easier major airport arrivals in Europe; the train station is directly under the terminal, so the path from baggage to platform is a single escalator down',
    options: [
      { mode: 'NS train (Sprinter or Intercity) to Centraal',  timeMin: [15, 20], cost: '~€5 to €6 on OVpay (charged per km)',         bestFor: 'The default for almost every arrival. Trains every few minutes day and night' },
      { mode: 'NS train direct to Zuid',                       timeMin: [8, 10],  cost: '~€4 on OVpay',                                 bestFor: 'Hotels in De Pijp, the museum quarter, or south of the centre; skips the Centraal transfer' },
      { mode: 'Uber / Bolt',                                   timeMin: [25, 45], cost: '€40 to €60 to the centre',                     bestFor: 'Late arrival, heavy luggage, or a group splitting the fare' },
      { mode: 'Taxi from the rank',                            timeMin: [25, 45], cost: '€50 to €65',                                   bestFor: 'Yellow-and-blue rank cars; reliable when the app surges' },
    ],
  },

  'athens': {
    airport: {
      iata: 'ATH',
      name: 'Athens International Eleftherios Venizelos',
      distanceKm: 33,
      driveTimeMin: [35, 50],
    },
    contextSentence:
      'sits about 33 km east of central Athens; the journey into town is well-served by both rail and bus, with rideshare as the third option',
    options: [
      { mode: 'Metro M3 (blue line) to Syntagma',  timeMin: [40, 40], cost: '€9 single, €16 return',     bestFor: 'The default. Trains every 30 minutes from the airport platform' },
      { mode: 'Express bus X95 to Syntagma',       timeMin: [50, 70], cost: '€6 single (24-hour)',       bestFor: 'Late-arrival pick because it runs all night' },
      { mode: 'Taxi from the rank',                timeMin: [35, 50], cost: '€40 day / €55 night flat',  bestFor: 'Confirm the flat fare with the driver before pulling away; the meter should start at zero' },
      { mode: 'Uber via Beat / FreeNow',           timeMin: [35, 50], cost: '€40 to €55',                bestFor: 'Beat is the dominant Greek rideshare; FreeNow also works. Both connect to licensed taxis' },
    ],
  },

  // Bruges and Rotterdam have no major international airport of their
  // own; arrival is by train from elsewhere. The "options" table on each
  // guide lists the rail routes rather than airport modes.
  'bruges': {
    airport: {
      iata: 'BRU',
      name: 'Brussels Airport (the nearest with international service)',
      distanceKm: 120,
      driveTimeMin: [90, 120],
    },
    contextSentence:
      'has no commercial airport of its own; almost every visitor arrives by train via Brussels or Ghent. SNCB runs the Intercity service that connects the Belgian rail network, and Bruges sits at the western end of the Ghent-Antwerp-Brussels axis',
    options: [
      { mode: 'SNCB Intercity from Brussels-Midi or Brussels-Central',       timeMin: [60, 60], cost: '€17.60 single second class',          bestFor: 'The default for visitors arriving via Brussels Airport (BRU) or Eurostar from London/Paris/Amsterdam' },
      { mode: 'SNCB Intercity from Ghent-Sint-Pieters',                      timeMin: [25, 25], cost: '~€10 single',                         bestFor: 'The pivot from Ghent; trains every 30 minutes' },
      { mode: 'SNCB IC from Antwerp-Centraal (via Ghent)',                   timeMin: [75, 75], cost: '~€18 single',                         bestFor: 'Through-ticketed from Antwerp; change at Ghent-Sint-Pieters' },
      { mode: 'Direct InterCity from Brussels Airport (BRU)',                timeMin: [90, 90], cost: '€20 to €25',                         bestFor: 'The cleanest path from a BRU arrival; direct service or one change at Brussels-Midi' },
      { mode: 'Charleroi (CRL) low-cost via bus + IC',                       timeMin: [120, 150], cost: '€30 to €40 total',                  bestFor: 'If a low-cost carrier dropped you at CRL; longer but workable' },
    ],
  },

  'rotterdam': {
    airport: {
      iata: 'AMS',
      name: 'Amsterdam Schiphol (the practical international gateway; RTM is a small regional)',
      distanceKm: 70,
      driveTimeMin: [26, 45],
    },
    contextSentence:
      'has its own small regional airport (RTM) that handles a handful of European low-cost routes, but almost every visitor arrives via Schiphol (AMS) or Eindhoven (EIN) and finishes on the train. Rotterdam Centraal is the rail gateway',
    options: [
      { mode: 'NS Intercity Direct from Schiphol (AMS)',                     timeMin: [26, 26], cost: '€18.20 on OVpay',           bestFor: 'The default. Direct from the airport platform under the terminal' },
      { mode: 'NS Intercity Direct from Amsterdam Centraal',                 timeMin: [42, 42], cost: '€17.50 on OVpay',           bestFor: 'Coming from an Amsterdam stay; same train one stop down the line' },
      { mode: 'Bus 401 + NS train via Eindhoven Centraal (from EIN)',        timeMin: [90, 90], cost: '€18 to €22 total',          bestFor: 'If a low-cost carrier dropped you at EIN' },
      { mode: 'Thalys / Eurostar from Brussels-Midi',                        timeMin: [75, 75], cost: '€40 to €90 advance',        bestFor: 'From London Eurostar via Brussels, or as a connection from Paris' },
      { mode: 'RET bus 33 from Rotterdam The Hague Airport (RTM)',           timeMin: [25, 25], cost: '€4 on OVpay',               bestFor: 'The local option if a low-cost carrier brought you to RTM directly' },
    ],
  },

  'cairo': {
    airport: {
      iata: 'CAI',
      name: 'Cairo International',
      distanceKm: 22,
      driveTimeMin: [45, 75],
    },
    contextSentence:
      'sits about 22 km north-east of central Cairo and 30 km north-east of Giza; the arrival can be the worst part of the trip if you let it, so the cleanest move for a late or red-eye landing is to skip the city transfer that first night entirely and overnight at the connected airport hotel',
    options: [
      { mode: 'Le Méridien Cairo Airport (overnight)',      timeMin: [0, 0],   cost: 'A standard 4-star room rate', bestFor: 'Late or red-eye arrivals. Connected to Terminal 3 by a jetbridge; you never exit the secure side of the airport' },
      { mode: 'Uber',                                       timeMin: [45, 75], cost: '200 to 400 EGP shown in-app; expect cash-push',  bestFor: 'The default for rested arrivals; have the app fare in small EGP notes ready, set payment to cash before the first ride' },
      { mode: 'Pre-booked hotel transfer',                  timeMin: [45, 90], cost: '600 to 1,200 EGP depending on hotel', bestFor: 'Driver waits with a name board; worth the premium for a first trip or a late arrival' },
      { mode: 'Airport taxi from the rank',                 timeMin: [45, 90], cost: '500 to 1,500 EGP after negotiation',  bestFor: 'Last resort. Agree the price in writing on a phone screen before loading luggage' },
    ],
  },

  'prague': {
    airport: { iata: 'PRG', name: 'Václav Havel Airport Prague', distanceKm: 17, driveTimeMin: [25, 45] },
    contextSentence: 'sits about 17 km west of the centre; the airport bus is the simplest way in, with a taxi as the easier-with-luggage alternative',
    options: [
      { mode: 'Bus 119 + Metro line A',  timeMin: [35, 45], cost: '40 CZK integrated ticket',        bestFor: 'The default. Bus 119 to Nádraží Veleslavín, transfer to the green metro line' },
      { mode: 'Airport Express (AE) bus', timeMin: [35, 40], cost: '100 CZK',                         bestFor: 'Direct to Praha hlavní nádraží with luggage racks' },
      { mode: 'Uber / Bolt / Liftago',    timeMin: [25, 45], cost: '350 to 650 CZK',                  bestFor: 'The right call with luggage or after a late arrival' },
      { mode: 'Taxi from the rank',       timeMin: [25, 45], cost: '600 to 900 CZK',                  bestFor: 'Last resort; use the Fix Taxi or AAA counters inside arrivals' },
    ],
  },
  'budapest': {
    airport: { iata: 'BUD', name: 'Budapest Ferenc Liszt International', distanceKm: 24, driveTimeMin: [30, 50] },
    contextSentence: 'sits about 24 km south-east of the city; the 100E airport bus is the cleanest option for most visitors, with rideshare as the alternative',
    options: [
      { mode: '100E airport bus',       timeMin: [35, 45], cost: '2,200 HUF single',                  bestFor: 'The default. Direct to Deák Ferenc tér every 20 to 30 minutes' },
      { mode: 'Bolt / Uber-equivalent', timeMin: [30, 50], cost: '7,000 to 12,000 HUF',               bestFor: 'Late arrival or heavy luggage; Bolt is the dominant Hungarian rideshare' },
      { mode: 'Bus 200E + Metro M3',    timeMin: [50, 70], cost: '450 HUF',                            bestFor: 'The cheapest path; bus 200E to Kőbánya-Kispest, transfer to the M3 blue metro' },
      { mode: 'Taxi from the rank',     timeMin: [30, 50], cost: '~9,500 HUF flat via Főtaxi',         bestFor: 'Book at the licensed Főtaxi counter inside arrivals for a fixed fare' },
    ],
  },
  'berlin': {
    airport: { iata: 'BER', name: 'Berlin Brandenburg Airport', distanceKm: 25, driveTimeMin: [30, 50] },
    contextSentence: 'sits about 25 km south-east of central Berlin; the FEX express train is the cleanest direct route to the centre, with the regional rail as a slightly slower backup',
    options: [
      { mode: 'FEX (Airport Express) train', timeMin: [30, 30], cost: '€4.40 ABC zone single',       bestFor: 'The default. Direct to Berlin Hauptbahnhof every 30 minutes' },
      { mode: 'S-Bahn S9 or S45',            timeMin: [45, 60], cost: '€4.40 ABC single',             bestFor: 'Cheaper alternative if the FEX timing is wrong; same fare' },
      { mode: 'Uber / FreeNow / taxi',       timeMin: [40, 60], cost: '€45 to €65 to the centre',     bestFor: 'Late arrival or heavy luggage' },
      { mode: 'Bus X7 + U-Bahn U7',          timeMin: [60, 75], cost: '€4.40 ABC single',             bestFor: 'For hotels in Neukölln or Kreuzberg; X7 from BER to Rudow connects to U7' },
    ],
  },
  'lisbon': {
    airport: { iata: 'LIS', name: 'Humberto Delgado Airport (Lisbon)', distanceKm: 7, driveTimeMin: [15, 30] },
    contextSentence: 'sits about 7 km north of the centre and is one of the closer European airport approaches; the red metro line connects directly into town',
    options: [
      { mode: 'Metro Red Line',          timeMin: [20, 30], cost: '€1.85 single + €0.50 Viva Viagem', bestFor: 'The default. Direct from the terminal to São Sebastião, then transfer' },
      { mode: 'Aerobus',                  timeMin: [20, 30], cost: '€4 single',                       bestFor: 'Direct to Praça do Comércio and Cais do Sodré' },
      { mode: 'Uber / Bolt / FreeNow',    timeMin: [15, 30], cost: '€10 to €18',                      bestFor: 'Cheap and easy; one of the more reliable rideshare markets in Europe' },
      { mode: 'Taxi from the rank',       timeMin: [15, 30], cost: '€12 to €20 metered',              bestFor: 'Legal rank cars run a real meter; small luggage surcharge applies' },
    ],
  },
  'rome': {
    airport: { iata: 'FCO', name: 'Leonardo da Vinci Fiumicino', distanceKm: 32, driveTimeMin: [40, 70] },
    contextSentence: 'sits about 32 km southwest of the centre; the Leonardo Express direct train to Roma Termini is the right default unless you have late luggage',
    options: [
      { mode: 'Leonardo Express train', timeMin: [32, 32], cost: '€14 single',                                 bestFor: 'The default. Direct from FCO to Roma Termini every 15 minutes' },
      { mode: 'FL1 regional train',      timeMin: [45, 50], cost: '€8 single',                                  bestFor: 'Cheaper; runs to Trastevere, Ostiense, Tiburtina' },
      { mode: 'Taxi (flat rate)',        timeMin: [40, 70], cost: '€55 flat to within the Aurelian walls',     bestFor: 'Late arrival or heavy luggage; flat fare set by law' },
      { mode: 'Uber Black / private car',timeMin: [40, 70], cost: '€70 to €120',                                bestFor: "Italy's Uber market is licensed-driver only; price reflects that" },
    ],
  },
  'milano': {
    airport: { iata: 'MXP', name: 'Milan Malpensa', distanceKm: 50, driveTimeMin: [50, 80] },
    contextSentence: 'is served by three airports: Malpensa (MXP) for international, Linate (LIN) for European city flights, and Bergamo Orio al Serio (BGY) for low-cost; MXP is the main gateway',
    options: [
      { mode: 'Malpensa Express train',   timeMin: [50, 60], cost: '€13 to €16 single',                                 bestFor: 'The default. Direct from MXP to Milano Centrale or Cadorna every 30 minutes' },
      { mode: 'Linate Metro M4',           timeMin: [15, 20], cost: '€2.20 city ticket',                                 bestFor: 'From Linate; M4 blue line direct to the centre' },
      { mode: 'Malpensa Shuttle bus',      timeMin: [60, 80], cost: '€10 single',                                        bestFor: 'Cheaper than the train; runs every 20 to 30 minutes' },
      { mode: 'Uber Black / taxi',         timeMin: [50, 80], cost: '€95 to €120 from MXP, €25 to €40 from LIN',         bestFor: "Italy's Uber is licensed-driver only; taxis run a real meter" },
    ],
  },
  'vienna': {
    airport: { iata: 'VIE', name: 'Vienna International', distanceKm: 18, driveTimeMin: [25, 45] },
    contextSentence: 'sits about 18 km southeast of the centre; the CAT express train is the fastest direct option, with the S-Bahn S7 as the cheaper alternative',
    options: [
      { mode: 'City Airport Train (CAT)', timeMin: [16, 16], cost: '€14.90 single',                bestFor: 'The fastest path. Non-stop to Wien Mitte every 30 minutes' },
      { mode: 'S-Bahn S7',                timeMin: [25, 25], cost: '€4.30 single',                 bestFor: 'The cheaper option; same line, slightly slower' },
      { mode: 'Uber / Bolt / FreeNow',    timeMin: [25, 45], cost: '€40 to €55',                   bestFor: 'Late arrival or heavy luggage' },
      { mode: 'Taxi from the rank',       timeMin: [25, 45], cost: '€45 to €60 metered',           bestFor: 'Reliable; rank cars run a real meter' },
    ],
  },
  'dublin': {
    airport: { iata: 'DUB', name: 'Dublin Airport', distanceKm: 10, driveTimeMin: [20, 40] },
    contextSentence: 'sits about 10 km north of the centre; the Airlink Express bus is the simplest path in, with rideshare as the easier-with-luggage option',
    options: [
      { mode: 'Airlink Express (747 / 757)', timeMin: [25, 35], cost: '€8 single',  bestFor: 'The default. Direct to the city centre every 15 minutes day and night' },
      { mode: 'Aircoach',                     timeMin: [25, 35], cost: '€10 single', bestFor: 'Alternative; serves Ballsbridge and Donnybrook in addition' },
      { mode: 'Uber / FreeNow / taxi',        timeMin: [20, 40], cost: '€30 to €50',  bestFor: 'Late arrival or heavy luggage; Dublin taxis run a real meter' },
      { mode: 'Local Dublin Bus 16 / 41 / 102', timeMin: [40, 60], cost: '€2 single', bestFor: 'The cheapest path; limited luggage space' },
    ],
  },
  'belgrade': {
    airport: { iata: 'BEG', name: 'Nikola Tesla Airport', distanceKm: 18, driveTimeMin: [25, 45] },
    contextSentence: 'sits about 18 km west of the centre; the A1 minibus is the simplest path in, with rideshare as the easier-with-luggage option',
    options: [
      { mode: 'A1 airport minibus',     timeMin: [30, 40], cost: '300 RSD single',     bestFor: 'The default. Direct to Slavija Square every 30 minutes; last departure 23:00' },
      { mode: 'Bus 72',                  timeMin: [40, 50], cost: '150 RSD single',     bestFor: 'The cheapest option; slower and more crowded' },
      { mode: 'CarGo / Yandex',          timeMin: [25, 45], cost: '1,500 to 2,500 RSD', bestFor: 'CarGo is the dominant Serbian rideshare; cheaper than kerb taxis' },
      { mode: 'Taxi from the rank',      timeMin: [25, 45], cost: '~2,500 RSD via airport counter', bestFor: 'Book at the licensed taxi counter inside arrivals; ignore drivers approaching in the hall' },
    ],
  },
  'sarajevo': {
    airport: { iata: 'SJJ', name: 'Sarajevo International', distanceKm: 12, driveTimeMin: [20, 35] },
    contextSentence: 'sits about 12 km southwest of the centre; the small airport has no rail link, so taxi or rideshare is the only real option',
    options: [
      { mode: 'Taxi from the rank',        timeMin: [20, 35], cost: '~30 BAM (€15) metered, ~40 BAM flat',  bestFor: 'The default. SJJ taxis run a real meter; agree the rate before pulling away for the flat fare' },
      { mode: 'Bolt / Yandex',             timeMin: [20, 35], cost: '20 to 35 BAM',                          bestFor: 'Bolt is the dominant rideshare; pickup at the marked airport lot' },
      { mode: 'Centrotrans bus',           timeMin: [30, 40], cost: '5 BAM single',                          bestFor: 'The cheapest path; runs to the bus station Nedjarici, not the historic centre' },
      { mode: 'Pre-booked hotel transfer', timeMin: [20, 35], cost: '40 to 60 BAM',                          bestFor: 'Most Baščaršija hotels can pre-arrange; useful for late arrivals' },
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
