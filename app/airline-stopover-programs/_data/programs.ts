export type Alliance = "Star Alliance" | "oneworld" | "SkyTeam" | "Non aligned";

export type StopoverProgram = {
  airline: string;
  alliance: Alliance | null;
  cities: string; // e.g. "Istanbul (IST)"
  hotelNights: string; // e.g. "0", "1", "1-2"
  duration: string; // validity window
  commentary: string;
  programUrl: string;
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
  // Star Alliance
  {
    airline: "Turkish Airlines",
    alliance: "Star Alliance",
    cities: "Istanbul (IST)",
    hotelNights: "1-2",
    duration: "Stopover hotel: at least 20 hours and up to 7 days.",
    commentary:
      "Complimentary hotel for eligible international round-trip itineraries: generally one night in economy or two nights in business. Turkish also runs Touristanbul, a separate guided city tour for eligible 6 to 24-hour layovers.",
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
    duration: "Legacy public page says up to 7 days; verify availability.",
    commentary:
      "Air Canada has a Toronto stopover page, but the visible public page is old. I would not plan around it unless the booking flow or airline confirms it.",
    programUrl:
      "https://www.aircanada.com/en-ca/flights-to-toronto/stopover-in-toronto",
  },
  {
    airline: "All Nippon Airways (ANA)",
    alliance: "Star Alliance",
    cities: "Japan via Tokyo and ANA domestic network",
    hotelNights: "0",
    duration:
      "Up to 2 stopovers per direction on eligible Japan itineraries; first free, second chargeable.",
    commentary:
      "Useful for turning a Japan trip into a multi-city itinerary on one ANA ticket. ANA markets one free and one USD 100 stopover per direction on eligible Value, Standard, and Full Flex fares when international and domestic travel are booked together.",
    programUrl:
      "https://www.ana.co.jp/en/mm/plan-book/promotions/multiple-stopovers-transfers/",
  },
  {
    airline: "Avianca",
    alliance: "Star Alliance",
    cities: "Bogotá (BOG)",
    hotelNights: "0",
    duration: "Up to 48 hours.",
    commentary:
      "Adds a Bogotá stop on connecting itineraries at no additional airfare. The program emphasizes destination discounts and partner offers rather than included hotel nights.",
    programUrl:
      "https://www.avianca.com/en/offers-destinations/stopover-bogota/",
  },
  {
    airline: "Copa Airlines",
    alliance: "Star Alliance",
    cities: "Panama City (PTY)",
    hotelNights: "0",
    duration: "24 hours to 15 days.",
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
      "Stopover programme oriented around Munich as an itinerary add-on. The offering centers on partner experiences and bookings rather than included hotel nights.",
    programUrl: "https://www.lufthansa.com/us/en/book-and-manage/stopover",
  },
  {
    airline: "LOT Polish Airlines",
    alliance: "Star Alliance",
    cities: "Warsaw (WAW)",
    hotelNights: "0",
    duration: "24 hours to 8 days.",
    commentary:
      "LOT Stopover is a Warsaw stop on eligible round-trip journeys that do not start in Poland. It gives partner discounts and Polish domestic-flight offers, not an included hotel.",
    programUrl: "https://www.lot.com/al/en/explore/lot-stopover",
  },
  {
    airline: "Singapore Airlines",
    alliance: "Star Alliance",
    cities: "Singapore (SIN)",
    hotelNights: "0",
    duration: "Layover 5.5 to under 24 hours; tour itself is about 2.5 hours.",
    commentary:
      "Free guided city tour for eligible transit passengers. The benefit is a tour, not a multi-day stopover program.",
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
      "Add a Portugal stopover at no additional airfare. Partner discounts available at hotels and attractions.",
    programUrl: "https://www.flytap.com/en-us/stopover",
  },

  // oneworld
  {
    airline: "Qatar Airways",
    alliance: "oneworld",
    cities: "Doha (DOH)",
    hotelNights: "1-4",
    duration: "Transit 12 to 96 hours; up to 4 nights.",
    commentary:
      "Discounted stopover hotel packages sold through Qatar Stopover. Useful, but not the same as a complimentary hotel.",
    programUrl: "https://www.qatarairways.com/en/offers/qatar-stopover.html",
  },
  {
    airline: "Oman Air",
    alliance: "oneworld",
    cities: "Muscat (MCT)",
    hotelNights: "1-3",
    duration: "1 to 3 nights.",
    commentary:
      "Bookable stopover packages with hotel nights included in the bundle. Pricing varies.",
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
      "Transit accommodation including hotel, meals, and transfers for eligible itineraries where RJ is the first available connection.",
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
      "Complimentary Colombo transit hotel for eligible SriLankan-to-SriLankan connections on one through ticket. Published fare thresholds, visa responsibility, and advance confirmation rules apply.",
    programUrl: "https://www.srilankan.com/en_uk/plan-and-book/transit-accommodation",
  },
  {
    airline: "Royal Air Maroc",
    alliance: "oneworld",
    cities: "Casablanca (CMN)",
    hotelNights: "possible",
    duration: "Over 8 hours; availability and exit permission matter.",
    commentary:
      "Royal Air Maroc publishes transit support at Casablanca: meal vouchers after 4 hours and possible hotel accommodation after 8 hours. Treat this as conditional transit handling, not a flexible stopover holiday.",
    programUrl: "https://www.royalairmaroc.com/ao-en/airport-transit",
  },
  {
    airline: "British Airways",
    alliance: "oneworld",
    cities: "London (LHR/LGW), constructed via multi-city booking",
    hotelNights: "0",
    duration: "Varies by fare rules or multi-city booking.",
    commentary:
      "No standardized stopover program with defined benefits. Stopovers can be constructed through multi-city pricing or BA Holidays multi-centre bookings.",
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
      "Stopover booking option in Hong Kong. Offers and discounts may apply; a hotel is not automatically included.",
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
      "Add a Madrid stopover at no additional airfare. Includes partner discounts at hotels and attractions.",
    programUrl: "https://www.iberia.com/us/en/iberia-stopover/",
  },
  {
    airline: "Japan Airlines (JAL)",
    alliance: "oneworld",
    cities: "Japan via Tokyo, Osaka, and JAL domestic network",
    hotelNights: "0",
    duration:
      "Stopovers over 24 hours via multi-city booking; domestic-flight offer varies by origin market.",
    commentary:
      "JAL supports multi-city stopover itineraries and has a complimentary domestic-flight offer for international passengers when the domestic and international flights are booked together. Some origin markets pay a stopover charge if the first Japan stay exceeds 24 hours.",
    programUrl:
      "https://www.jal.co.jp/jp/en/inter/reservation/multi-city/",
  },

  // SkyTeam
  {
    airline: "Saudia",
    alliance: "SkyTeam",
    cities: "Saudi Arabia (commonly via Jeddah JED or Riyadh RUH)",
    hotelNights: "1",
    duration: "Up to 96 hours.",
    commentary:
      "Stopover visa flow with a one-night accommodation benefit on eligible Saudia itineraries.",
    programUrl: "https://www.saudia.com/transit-visa",
  },
  {
    airline: "XiamenAir",
    alliance: "SkyTeam",
    cities: "Xiamen (XMN), Fuzhou (FOC), Quanzhou (JJN), Hangzhou (HGH)",
    hotelNights: "1",
    duration: "6 to 24 hours; flights must not depart on the same calendar day.",
    commentary:
      "Free transit accommodation for eligible international or regional connecting flights on the same ticket. Hotel level depends on cabin; ground transport is not included.",
    programUrl:
      "https://www.xiamenair.com/brandnew_EN/passenger-service/transfer-cf.html",
  },
  {
    airline: "China Airlines",
    alliance: "SkyTeam",
    cities: "Taipei (TPE)",
    hotelNights: "possible",
    duration: "Campaign-specific; current UK offer covers eligible 2026 dates.",
    commentary:
      "China Airlines has active Taipei stopover marketing, including a route-specific free-hotel campaign from London Heathrow for eligible 2026 travel. Useful, but verify the campaign, route, passport, and travel-date rules before booking.",
    programUrl: "https://taipeistopover.service.china-airlines.com/",
  },
  {
    airline: "China Eastern Airlines",
    alliance: "SkyTeam",
    cities: "Selected China Eastern and Shanghai Airlines hubs",
    hotelNights: "possible",
    duration: "Long overnight transit on eligible MU or FM itineraries.",
    commentary:
      "China Eastern publishes an official overnight transit hotel application, but the public page exposes limited rule detail. Confirm airport, ticket stock, fare eligibility, and application approval before relying on it.",
    programUrl: "https://us.ceair.com/en/transit-hotel-application.html",
  },
  {
    airline: "Korean Air",
    alliance: "SkyTeam",
    cities: "Seoul area via Incheon (ICN)",
    hotelNights: "0",
    duration: "Connection must be 4 to 24 hours.",
    commentary:
      "Free transit tour program for eligible connections. The benefit is a guided tour rather than hotel accommodation.",
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
      "Stopover offering with suggested 24, 48, or 72-hour Copenhagen stays. Subject to routing and booking flow.",
    programUrl: "https://www.flysas.com/en/themes/stopover",
  },

  // Non-aligned
  {
    airline: "Air Astana",
    alliance: "Non aligned",
    cities: "Almaty (ALA), Astana (NQZ)",
    hotelNights: "1",
    duration: "Minimum 10-hour international connection.",
    commentary:
      "MySTOPOVER offers one hotel night, breakfast, and airport transfers for a small fixed package price on eligible international connections through Kazakhstan. Extra nights may be available for an added fee.",
    programUrl:
      "https://ir.airastana.com/en/about-us/company-news/air-astana-resumes-stopover-holiday-program/",
  },
  {
    airline: "Etihad",
    alliance: "Non aligned",
    cities: "Abu Dhabi (AUH)",
    hotelNights: "1-2",
    duration: "24 to 96 hours.",
    commentary:
      "Abu Dhabi Stopover. Complimentary stay of up to two nights at selected hotels on eligible Etihad bookings.",
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
      "6 or 8 to 26 hours, depending on cabin and itinerary rules.",
    commentary:
      "Dubai Connect. Complimentary hotel, transfers, and meals for eligible long connections when the itinerary uses the shortest available connection.",
    programUrl:
      "https://www.emirates.com/english/before-you-fly/dubai-international-airport/dubai-connect/",
  },
  {
    airline: "Gulf Air",
    alliance: "Non aligned",
    cities: "Bahrain (BAH)",
    hotelNights: "1",
    duration: "Economy over 7 and under 24 hours; Falcon Gold over 6 and under 24 hours.",
    commentary:
      "Bahrain Stopover Paid by Carrier can provide a complimentary hotel for qualifying Gulf Air-operated through fares that meet fare-value and connection-time rules. Non-qualifying passengers may be able to buy the service.",
    programUrl:
      "https://www.gulfair.com/explore/explore-bahrain/transit-in-bahrain",
  },
  {
    airline: "Hainan Airlines",
    alliance: "Non aligned",
    cities: "Haikou (HAK), Chongqing (CKG); Beijing and Shenzhen listed as forthcoming",
    hotelNights: "1",
    duration: "Haikou: over 4 to 72 hours; Chongqing hotel: over 8 to 48 hours.",
    commentary:
      "Hainan publishes transfer benefits at selected Chinese hubs. Haikou offers one complimentary room voucher for eligible international or regional transfer passengers; Chongqing offers a hotel for eligible overnight transfers, subject to advance QR-code application and daily room limits.",
    programUrl:
      "https://www.hainanairlines.com/HUPortal/dyn/portal/DisplayPage?COUNTRY_SITE=GB&LANGUAGE=US&PAGE=ATST&SITE=CBHZCBHZ",
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
  {
    airline: "Royal Brunei Airlines",
    alliance: "Non aligned",
    cities: "Bandar Seri Begawan (BWN)",
    hotelNights: "possible",
    duration: "More than 8 and not more than 24 hours.",
    commentary:
      "Royal Brunei has a stopover request program for selected city pairs, valid for tickets purchased from March 4, 2025 through September 30, 2026. Request at least five working days before arrival and verify the exact city-pair, visa, and hotel terms.",
    programUrl:
      "https://www.flyroyalbrunei.com/brunei/en/book-manage/stopover-in-brunei/",
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
    if (p.alliance) out[p.alliance].push(p);
  }
  return out;
}
