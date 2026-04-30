export type Alliance = "Star Alliance" | "oneworld" | "SkyTeam" | "Non aligned";

export type StopoverProgram = {
  airline: string;
  alliance: Alliance | null;
  cities: string; // e.g. "Istanbul (IST)"
  hotelNights: string; // e.g. "0", "1", "1–2"
  duration: string; // validity window
  commentary: string;
  programUrl: string;
  /** Stub rows that show up in the "Researching" section at the bottom. */
  isStub?: boolean;
};

export const ALLIANCES: Alliance[] = [
  "Star Alliance",
  "oneworld",
  "SkyTeam",
  "Non aligned",
];

/**
 * Tailwind class fragments per alliance. Keeping these as full classes (not
 * interpolated strings) so Tailwind's JIT picks them up.
 */
export const ALLIANCE_STYLES: Record<
  Alliance,
  {
    label: string;
    badge: string; // pill background + text
    border: string; // section border accent
    dot: string; // small accent dot
  }
> = {
  "Star Alliance": {
    label: "Star Alliance",
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
    border: "border-amber-300 dark:border-amber-700",
    dot: "bg-amber-500",
  },
  oneworld: {
    label: "oneworld",
    badge: "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
    border: "border-rose-300 dark:border-rose-700",
    dot: "bg-rose-500",
  },
  SkyTeam: {
    label: "SkyTeam",
    badge: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
    border: "border-sky-300 dark:border-sky-700",
    dot: "bg-sky-500",
  },
  "Non aligned": {
    label: "Non-aligned",
    badge:
      "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
    border: "border-violet-300 dark:border-violet-700",
    dot: "bg-violet-500",
  },
};

/**
 * Rows are pre-sorted within each alliance: programs that include a hotel
 * (descending nights) first, then no-hotel programs alphabetically by airline.
 */
export const PROGRAMS: StopoverProgram[] = [
  // ── Star Alliance ─────────────────────────────────────────────────────
  {
    airline: "Turkish Airlines",
    alliance: "Star Alliance",
    cities: "Istanbul (IST)",
    hotelNights: "1–2",
    duration:
      "Stopover program with a free hotel benefit (timing depends on eligibility rules).",
    commentary:
      "Complimentary hotel — typically 1 night in economy, 2 nights in business — for eligible itineraries.",
    programUrl: "https://www.turkishairlines.com/en-int/flights/stopover/",
  },
  {
    airline: "Air China",
    alliance: "Star Alliance",
    cities: "Beijing (PEK), Chengdu (TFU), Shanghai (PVG), Hangzhou (HGH), Tianjin (TSN), Wenzhou (WNZ)",
    hotelNights: "1",
    duration: "Overnight 6 to 30 hours (varies by itinerary).",
    commentary:
      "Transit accommodation: eligible transfer passengers can receive a complimentary hotel night (inventory and routing dependent).",
    programUrl: "https://m.airchina.com/c/invoke/zzjdinstruction%40pgenus",
  },
  {
    airline: "Ethiopian Airlines",
    alliance: "Star Alliance",
    cities: "Addis Ababa (ADD)",
    hotelNights: "1",
    duration: "Transit 8 to 24 hours.",
    commentary:
      "Hotel voucher provided for qualifying long-transit passengers; typically one night.",
    programUrl:
      "https://www.ethiopianairlines.com/es/en/services/services-at-the-airport/addis-ababa-stopovers",
  },
  {
    airline: "Air Canada",
    alliance: "Star Alliance",
    cities: "Toronto (YYZ)",
    hotelNights: "0",
    duration: "Up to 48 hours.",
    commentary:
      "Marketed Toronto stopover offer on select itineraries; framed as an experience rather than included hotel nights.",
    programUrl:
      "https://www.aircanada.com/en-ca/flights-to-toronto/stopover-in-toronto",
  },
  {
    airline: "Avianca",
    alliance: "Star Alliance",
    cities: "Bogotá (BOG)",
    hotelNights: "0",
    duration: "Up to 48 hours.",
    commentary:
      "Stopover Bogotá: add a stop on connecting itineraries with no additional airfare. Positioned around destination perks and discounts rather than included hotels.",
    programUrl:
      "https://www.avianca.com/en/offers-destinations/stopover-bogota/",
  },
  {
    airline: "Copa Airlines",
    alliance: "Star Alliance",
    cities: "Panama City (PTY)",
    hotelNights: "0",
    duration: "24 hours to 7 days.",
    commentary:
      "Add a Panama stopover on eligible itineraries with no additional airfare.",
    programUrl: "https://panama-stopover.com/en/",
  },
  {
    airline: "Lufthansa",
    alliance: "Star Alliance",
    cities: "Munich (MUC)",
    hotelNights: "0",
    duration: "Up to 7 days.",
    commentary:
      "Stopover programme marketed primarily for Munich as an add-on to itineraries — more about experiences and add-on bookings than bundled hotel nights.",
    programUrl: "https://www.lufthansa.com/us/en/book-and-manage/stopover",
  },
  {
    airline: "Singapore Airlines",
    alliance: "Star Alliance",
    cities: "Singapore (SIN)",
    hotelNights: "0",
    duration: "Layover 5.5 to under 24 hours; tour itself is about 2.5 hours.",
    commentary:
      "Free city tour for eligible transit passengers. Note: this is a tour, not a multi-day stopover program.",
    programUrl:
      "https://www.singaporeair.com/en_UK/es/plan-travel/privileges/free-singapore-tour/",
  },
  {
    airline: "TAP Air Portugal",
    alliance: "Star Alliance",
    cities: "Lisbon (LIS), Porto (OPO)",
    hotelNights: "0",
    duration: "Up to 10 days.",
    commentary:
      "Add a Portugal stopover with no additional airfare, plus partner discounts at hotels and attractions.",
    programUrl: "https://www.flytap.com/en-us/stopover",
  },

  // ── oneworld ──────────────────────────────────────────────────────────
  {
    airline: "Qatar Airways",
    alliance: "oneworld",
    cities: "Doha (DOH)",
    hotelNights: "1–4",
    duration: "Transit 12 to 96 hours; up to 4 nights.",
    commentary:
      "Discounted stopover hotel packages (not usually free) sold via Qatar Stopover.",
    programUrl: "https://www.qatarairways.com/en/offers/qatar-stopover.html",
  },
  {
    airline: "Oman Air",
    alliance: "oneworld",
    cities: "Muscat (MCT)",
    hotelNights: "1–3",
    duration: "1 to 3 nights.",
    commentary:
      "Bookable stopover packages that include hotel nights as part of the bundle. Pricing varies.",
    programUrl: "https://www.omanair.com/en_es/stopover-in-muscat",
  },
  {
    airline: "Royal Jordanian",
    alliance: "oneworld",
    cities: "Amman (AMM)",
    hotelNights: "1",
    duration:
      "6 or 8 to 24 hours (max 1 night; 6+ hours in Crown, 8+ in Economy).",
    commentary:
      "Transit accommodation: hotel, meals, and transfers for eligible itineraries where RJ is the first available connection.",
    programUrl:
      "https://www.rj.com/en/info-and-tips/our-hub-and-beyond/transit-accommodation",
  },
  {
    airline: "SriLankan Airlines",
    alliance: "oneworld",
    cities: "Colombo (CMB)",
    hotelNights: "1",
    duration: "8 to 24 hours.",
    commentary:
      "Complimentary hotel in Colombo for eligible transit passengers within the stated window. Conditions apply.",
    programUrl: "https://www.srilankan.com/en_uk/plan-and-book/transit-accommodation",
  },
  {
    airline: "British Airways",
    alliance: "oneworld",
    cities: "London (LHR/LGW) — self-built",
    hotelNights: "0",
    duration: "Varies by fare rules or multi-city booking.",
    commentary:
      "No standardized stopover program with defined perks. You can construct stopovers via multi-city pricing or BA Holidays multi-centre bookings.",
    programUrl:
      "https://www.britishairways.com/content/holidays/holiday-types/multi-centre-holidays",
  },
  {
    airline: "Cathay Pacific",
    alliance: "oneworld",
    cities: "Hong Kong (HKG)",
    hotelNights: "0",
    duration: "1 to 7 days.",
    commentary:
      "Stopover booking option in Hong Kong; offers and discounts may appear, but a hotel is not inherently included.",
    programUrl:
      "https://flights.cathaypacific.com/en_HK/offers/stopover-in-hong-kong.html",
  },
  {
    airline: "Iberia",
    alliance: "oneworld",
    cities: "Madrid (MAD)",
    hotelNights: "0",
    duration: "24 hours to 10 days (max 9 nights).",
    commentary:
      "Add a Madrid stopover with no additional airfare, plus city discounts and perks.",
    programUrl: "https://www.iberia.com/us/en/iberia-stopover/",
  },

  // ── SkyTeam ───────────────────────────────────────────────────────────
  {
    airline: "Saudia",
    alliance: "SkyTeam",
    cities: "Saudi Arabia (commonly via Jeddah JED or Riyadh RUH)",
    hotelNights: "1",
    duration: "Up to 96 hours.",
    commentary:
      "Stopover visa flow marketed with a one-night accommodation benefit on eligible Saudia itineraries.",
    programUrl: "https://www.saudia.com/transit-visa",
  },
  {
    airline: "Korean Air",
    alliance: "SkyTeam",
    cities: "Seoul area via Incheon (ICN)",
    hotelNights: "0",
    duration: "Connection must be 4 to 24 hours.",
    commentary:
      "Free transit tour program for eligible connections. (Tour, not hotel.)",
    programUrl:
      "https://www.koreanair.com/contents/plan-your-travel/at-the-airport/incheon-airport/transfer/transit-program?hl=en",
  },
  {
    airline: "Scandinavian Airlines (SAS)",
    alliance: "SkyTeam",
    cities: "Copenhagen (CPH)",
    hotelNights: "0",
    duration: "Up to 72 hours.",
    commentary:
      "Stopover concept with suggested 24, 48, or 72-hour Copenhagen stays. Routing and booking flow dependent.",
    programUrl: "https://www.flysas.com/en/themes/stopover",
  },

  // ── Non-aligned ───────────────────────────────────────────────────────
  {
    airline: "Etihad",
    alliance: "Non aligned",
    cities: "Abu Dhabi (AUH)",
    hotelNights: "1–2",
    duration: "Minimum 24-hour stop, commonly up to 96 hours.",
    commentary:
      "Abu Dhabi Stopover: complimentary hotel stay (up to two nights free) on eligible bookings.",
    programUrl: "https://www.etihad.com/en/abu-dhabi/stopover",
  },
  {
    airline: "China Southern",
    alliance: "Non aligned",
    cities:
      "Beijing (PEK), Changsha (CSX), Shenzhen (SZX), Urumqi (URC), Guangzhou (CAN), Dalian (DLC), Wuhan (WUH), Shenyang (SHE)",
    hotelNights: "1",
    duration: "Connecting time 6 to 30 hours.",
    commentary:
      "Free accommodation program for eligible transfer passengers on qualifying connections through listed hubs.",
    programUrl:
      "https://www.csair.com/sg/en/tourguide/airport_service/transit_flow/free/",
  },
  {
    airline: "Emirates",
    alliance: "Non aligned",
    cities: "Dubai (DXB)",
    hotelNights: "1",
    duration:
      "Typically for long connections when no better connection is available — often cited as 10 to 24 hours.",
    commentary:
      "Dubai Connect: complimentary hotel plus transfers and meals for eligible long connections.",
    programUrl:
      "https://www.emirates.com/english/before-you-fly/dubai-international-airport/dubai-connect/",
  },
  {
    airline: "Icelandair",
    alliance: "Non aligned",
    cities: "Reykjavík and Iceland via Keflavík (KEF)",
    hotelNights: "0",
    duration: "Up to 7 days.",
    commentary:
      "Add an Iceland stopover on transatlantic itineraries with no additional airfare.",
    programUrl: "https://www.icelandair.com/flights/stopover/",
  },

  // ── Researching (no details yet) ──────────────────────────────────────
  {
    airline: "China Airlines",
    alliance: null,
    cities: "",
    hotelNights: "",
    duration: "",
    commentary: "",
    programUrl: "",
    isStub: true,
  },
  {
    airline: "China Eastern",
    alliance: null,
    cities: "",
    hotelNights: "",
    duration: "",
    commentary: "",
    programUrl: "",
    isStub: true,
  },
  {
    airline: "Hainan Airlines",
    alliance: null,
    cities: "",
    hotelNights: "",
    duration: "",
    commentary: "",
    programUrl: "",
    isStub: true,
  },
  {
    airline: "SWISS",
    alliance: "Star Alliance",
    cities: "",
    hotelNights: "",
    duration: "",
    commentary: "",
    programUrl: "",
    isStub: true,
  },
  {
    airline: "XiamenAir",
    alliance: "SkyTeam",
    cities: "",
    hotelNights: "",
    duration: "",
    commentary: "",
    programUrl: "",
    isStub: true,
  },
];

/** Group programs by alliance, preserving file order within each group. */
export function groupByAlliance(
  programs: StopoverProgram[]
): Record<Alliance, StopoverProgram[]> {
  const out: Record<Alliance, StopoverProgram[]> = {
    "Star Alliance": [],
    oneworld: [],
    SkyTeam: [],
    "Non aligned": [],
  };
  for (const p of programs) {
    if (p.alliance && !p.isStub) out[p.alliance].push(p);
  }
  return out;
}

/** Programs flagged as stubs — rendered in the "Researching" tail section. */
export function getStubs(programs: StopoverProgram[]): StopoverProgram[] {
  return programs.filter((p) => p.isStub);
}
