import type { Metadata } from "next";
import Image from "next/image";

import { AllianceFilter } from "./_components/AllianceFilter";
import { ProgramCard } from "./_components/ProgramCard";
import {
  ALLIANCES,
  ALLIANCE_STYLES,
  PROGRAMS,
  groupByAlliance,
} from "./_data/programs";

const SITE_URL = "https://go.mike-lee.me";
const PAGE_PATH = "/airline-stopover-programs";
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const PUBLISHED_ISO = "2026-04-30";
const UPDATED_ISO = "2026-05-05";
const LAST_UPDATED_LABEL = "May 5, 2026";
const AUTHOR_NAME = "Mike Lee";

// Hero photo: Mike's own shot from a mosque visited on an Oman Air stopover
// in Muscat. Lives in /public so Next/Image can serve responsive variants and
// social platforms can fetch the absolute URL for previews.
const HERO_IMAGE = "/images/posts/airline-stopover-programs.jpg";
const HERO_IMAGE_URL = `${SITE_URL}${HERO_IMAGE}`;
const HERO_ALT =
  "A mosque visited during an Oman Air stopover in Muscat, a real example of breaking up a long-haul flight into a short trip.";

const PAGE_TITLE = "Mike's Ultimate Airline Stopover Guide";
const PAGE_DESCRIPTION =
  "A practical guide to airline stopover programs, free and discounted hotel offers, transit tours, and when a stopover is worth adding to a long-haul trip.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: "article",
    url: PAGE_URL,
    publishedTime: PUBLISHED_ISO,
    modifiedTime: UPDATED_ISO,
    authors: [AUTHOR_NAME],
    images: [
      {
        url: HERO_IMAGE_URL,
        width: 2400,
        height: 1260,
        alt: HERO_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [HERO_IMAGE_URL],
  },
  alternates: {
    canonical: PAGE_PATH,
  },
};

function airlineSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function termSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const TERMINOLOGY: { term: string; definition: string }[] = [
  {
    term: "Nonstop flight",
    definition:
      "A flight from origin to destination with no intermediate stops.",
  },
  {
    term: "Direct flight",
    definition:
      "A single flight number that may include an intermediate stop. It is not the same thing as a nonstop flight.",
  },
  {
    term: "Layover",
    definition:
      "A connection between two flights, usually under 24 hours, used mainly to reach the onward flight.",
  },
  {
    term: "Stopover",
    definition:
      "A planned break in the trip, usually over 24 hours, that lets you leave the airport and spend time in the connecting city.",
  },
];

const BENEFIT_TYPES: {
  type: string;
  meaning: string;
  examples: string;
}[] = [
  {
    type: "Complimentary or conditional hotel",
    meaning:
      "The airline may arrange the room because the connection is long and eligible. This is usually a rule-bound transit benefit, not permission to choose any stop you want.",
    examples:
      "Turkish Airlines, Ethiopian Airlines, Royal Jordanian, SriLankan Airlines, Gulf Air, Emirates, China Southern, XiamenAir",
  },
  {
    type: "Stopover package",
    meaning:
      "The airline sells hotels or local offers around its hub. This can still be a good deal, but the hotel is part of a paid bundle.",
    examples: "Qatar Airways, Oman Air, Air Astana",
  },
  {
    type: "No-extra-airfare stop",
    meaning:
      "The ticketing tool lets you pause the itinerary at the hub without adding airfare. The room, meals, and sightseeing are normally on you.",
    examples:
      "Copa Airlines, TAP Air Portugal, Avianca, Iberia, Icelandair, ANA, JAL",
  },
  {
    type: "Transit tour",
    meaning:
      "The benefit is a guided tour during a long layover, usually under 24 hours. This is for seeing the city once, not for turning the hub into a trip.",
    examples: "Turkish Airlines Touristanbul, Singapore Airlines, Korean Air, Gulf Air",
  },
  {
    type: "Constructed stopover",
    meaning:
      "There is no branded stopover program, but a multi-city search or package booking may still price sensibly.",
    examples: "British Airways",
  },
];

const BOOKING_CHECKS: string[] = [
  "Price it as a normal round trip, a multi-city ticket, and the airline stopover flow if there is one.",
  "Check whether the stop is voluntary. Some hotel benefits disappear if a shorter connection was available.",
  "Confirm whether bags come out at the stop or stay checked through.",
  "Check entry rules before assuming you can leave the airport.",
  "Look at the transfer, not just the flight time. A free hotel can still waste a day if it is badly located.",
  "Be honest about the season. Muscat in extreme heat and Helsinki in winter are not the same planning problem.",
];

function StructuredData() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    image: [HERO_IMAGE_URL],
    datePublished: PUBLISHED_ISO,
    dateModified: UPDATED_ISO,
    author: { "@type": "Person", name: AUTHOR_NAME },
    publisher: { "@type": "Person", name: AUTHOR_NAME },
    mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
    url: PAGE_URL,
    inLanguage: "en",
    about: [
      { "@type": "Thing", name: "airline stopover programs" },
      { "@type": "Thing", name: "long-haul flight planning" },
      { "@type": "Thing", name: "transit hotels" },
    ],
    mentions: PROGRAMS.map((p) => ({
      "@type": "Airline",
      name: p.airline,
      ...(p.programUrl ? { url: p.programUrl } : {}),
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: PAGE_TITLE,
        item: PAGE_URL,
      },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: PAGE_TITLE,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: PROGRAMS.length,
    itemListElement: PROGRAMS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${PAGE_URL}#${airlineSlug(p.airline)}`,
      item: {
        "@type": "Service",
        name: `${p.airline} stopover program`,
        provider: {
          "@type": "Airline",
          name: p.airline,
        },
        ...(p.cities ? { areaServed: p.cities } : {}),
        ...(p.commentary ? { description: p.commentary } : {}),
        ...(p.programUrl ? { url: p.programUrl } : {}),
      },
    })),
  };

  const definedTerms = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${PAGE_URL}#stopover-terms`,
    name: "Stopover booking terminology",
    description:
      "Definitions used in Mike Lee's airline stopover guide to distinguish nonstop flights, direct flights, layovers, and stopovers.",
    hasDefinedTerm: TERMINOLOGY.map((row) => ({
      "@type": "DefinedTerm",
      "@id": `${PAGE_URL}#term-${termSlug(row.term)}`,
      name: row.term,
      description: row.definition,
      inDefinedTermSet: `${PAGE_URL}#stopover-terms`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTerms) }}
      />
    </>
  );
}

export default function AirlineStopoverProgramsPage() {
  const grouped = groupByAlliance(PROGRAMS);

  const counts = {
    "Star Alliance": grouped["Star Alliance"].length,
    oneworld: grouped.oneworld.length,
    SkyTeam: grouped.SkyTeam.length,
    "Non aligned": grouped["Non aligned"].length,
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <StructuredData />

      <figure className="relative mb-8 overflow-hidden rounded-xl bg-cream-soft">
        <div className="relative aspect-[16/9]">
          <Image
            src={HERO_IMAGE}
            alt={HERO_ALT}
            fill
            sizes="(max-width: 768px) 100vw, 56rem"
            priority
            className="object-cover"
          />
        </div>
      </figure>

      <header className="mb-10">
        <h1 className="text-h1 text-ink-deep">{PAGE_TITLE}</h1>
        <p className="mt-3 text-label uppercase tracking-wider text-muted">
          By {AUTHOR_NAME} · Updated {LAST_UPDATED_LABEL}
        </p>
        <div className="mt-5 space-y-4 text-prose leading-relaxed text-ink">
          <p>
            Stopover programs are not exactly a secret, but I am still
            surprised by how often friends and colleagues have never used one.
            This guide is meant to get you up to speed quickly: what a stopover
            can get you, which airline programs are worth checking, and when
            the whole thing is more trouble than it is worth.
          </p>
          <p>
            The basic idea is simple. If your route already connects through a
            hub, a stopover can let you tick the box on a new place without
            going far out of your way. Sometimes that means a free hotel,
            sometimes a discounted package, sometimes a domestic add-on, and
            sometimes just a cleaner way to split a long-haul trip.
          </p>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="text-h2 text-ink-deep mb-4">
          What Makes a Stopover Worth Checking
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sand bg-white/60 p-5">
            <h3 className="text-h3 text-ink-deep">A Real Hotel Benefit</h3>
            <p className="mt-2 text-body leading-relaxed text-ink">
              Turkish, Emirates, SriLankan, Gulf Air, Royal Jordanian,
              Ethiopian, China Southern, and XiamenAir can be useful when the
              long connection is eligible. Read the rule carefully, because
              these are usually transit benefits with strict conditions.
            </p>
          </div>
          <div className="rounded-xl border border-sand bg-white/60 p-5">
            <h3 className="text-h3 text-ink-deep">A Cheap Holiday Extension</h3>
            <p className="mt-2 text-body leading-relaxed text-ink">
              Copa, TAP, Iberia, Icelandair, Avianca, and LOT are the kind of
              programs I check when I want to turn a connection into a short
              city stay without adding airfare. ANA and JAL are also worth
              checking for Japan, especially when a domestic add-on can turn a
              Tokyo trip into a broader Japan itinerary.
            </p>
          </div>
          <div className="rounded-xl border border-sand bg-white/60 p-5">
            <h3 className="text-h3 text-ink-deep">A Strong Hotel Package</h3>
            <p className="mt-2 text-body leading-relaxed text-ink">
              Qatar and Oman Air are more like stopover bundles than free
              hotel programs. They can still be a good move when the hotel
              price, transfer, and flight schedule line up.
            </p>
          </div>
          <div className="rounded-xl border border-sand bg-white/60 p-5">
            <h3 className="text-h3 text-ink-deep">A Guided Layover Tour</h3>
            <p className="mt-2 text-body leading-relaxed text-ink">
              Turkish Touristanbul, Singapore Airlines, Korean Air, and Gulf
              Air are worth checking when you have a long layover but not
              enough time to plan a proper overnight stop.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-4">
          Airline Stopover Programs to Check
        </h2>
        <div className="space-y-4 text-prose text-ink leading-relaxed">
          <p>
            Use these cards as a starting point, then confirm the current
            rules on the airline site before booking. Hotel possible means the
            benefit is conditional, campaign-based, route-specific, or subject
            to inventory. No hotel can still be useful if the fare works.
          </p>
          <p>
            I group the cards by alliance because that is how most flight
            searches start. The stopover rule still belongs to the operating
            airline.
          </p>
        </div>
      </section>

      <div id="programs-top" className="scroll-mt-24" />
      <AllianceFilter counts={counts} />

      <div className="space-y-12">
        {ALLIANCES.map((alliance) => {
          const programs = grouped[alliance];
          if (programs.length === 0) return null;
          const style = ALLIANCE_STYLES[alliance];
          const sectionId =
            alliance === "Star Alliance"
              ? "star-alliance"
              : alliance === "Non aligned"
                ? "non-aligned"
                : alliance.toLowerCase();
          return (
            <section
              key={alliance}
              id={sectionId}
              className="scroll-mt-24"
              aria-labelledby={`${sectionId}-heading`}
            >
              <header className="mb-4 flex items-baseline gap-3 border-b border-sand pb-2">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${style.dot}`}
                  aria-hidden="true"
                />
                <h2
                  id={`${sectionId}-heading`}
                  className="text-h2 text-ink-deep"
                >
                  {style.label}
                </h2>
                <span className="text-small tabular-nums text-muted">
                  {programs.length}{" "}
                  {programs.length === 1 ? "program" : "programs"}
                </span>
              </header>
              <div className="grid gap-4 sm:grid-cols-2">
                {programs.map((p) => (
                  <div
                    key={p.airline}
                    id={airlineSlug(p.airline)}
                    className="scroll-mt-24"
                  >
                    <ProgramCard program={p} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-16">
        <h2 className="text-h2 text-ink-deep mb-4">
          Keep Reading: How to Use a Stopover Well
        </h2>
        <div className="space-y-4 text-prose text-ink leading-relaxed">
          <p>
            Once a program looks promising, ignore the marketing for a minute
            and test the itinerary. A stopover should make the trip better. It
            should not add a worse flight, a useless discount, or a night in a
            hotel far from both the airport and the city.
          </p>
          <p>
            I start with the trip I actually need to take, then price it as a
            round trip, a one-way combination, and a multi-city ticket. If the
            stop keeps the fare close, creates real time on the ground, and
            does not make the transfer annoying, it is worth considering.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sand bg-white/60 p-5">
            <h3 className="text-h3 text-ink-deep">Worth It When</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-body leading-relaxed text-ink">
              <li>The hub is already on a sensible route.</li>
              <li>The stop keeps the fare close, or makes it cheaper.</li>
              <li>There is something worth doing without a long transfer.</li>
              <li>The entry rules and airport transfer are straightforward.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-sand bg-white/60 p-5">
            <h3 className="text-h3 text-ink-deep">Usually Skip When</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-body leading-relaxed text-ink">
              <li>The routing gets worse just to chase a perk.</li>
              <li>The benefit is a discount you would never use otherwise.</li>
              <li>Arrival and departure times leave no real city time.</li>
              <li>The visa, weather, transfer, or hotel location turns it into work.</li>
            </ul>
          </div>
        </div>

        <h3 className="mt-8 text-h3 text-ink-deep">
          Terms That Change the Booking
        </h3>
        <p className="mt-3 text-prose text-ink leading-relaxed">
          These terms matter because airline rules often treat them
          differently. A long layover may qualify for a transit hotel or tour.
          A stopover may require a multi-city booking or a specific stopover
          flow.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sand">
                <th
                  scope="col"
                  className="py-2 pr-6 text-left font-semibold text-ink-deep"
                >
                  Term
                </th>
                <th
                  scope="col"
                  className="py-2 text-left font-semibold text-ink-deep"
                >
                  What it means
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {TERMINOLOGY.map((row) => (
                <tr key={row.term} id={`term-${termSlug(row.term)}`}>
                  <td className="py-3 pr-6 align-top font-medium text-ink-deep">
                    {row.term}
                  </td>
                  <td className="py-3 align-top text-ink">
                    {row.definition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-8 text-h3 text-ink-deep">
          What the Airline Is Actually Offering
        </h3>
        <p className="mt-3 text-prose text-ink leading-relaxed">
          The word stopover gets used for different products. Before booking,
          separate the benefit from the destination.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-sand">
                <th
                  scope="col"
                  className="py-2 pr-6 text-left font-semibold text-ink-deep"
                >
                  Benefit type
                </th>
                <th
                  scope="col"
                  className="py-2 pr-6 text-left font-semibold text-ink-deep"
                >
                  What it means
                </th>
                <th
                  scope="col"
                  className="py-2 text-left font-semibold text-ink-deep"
                >
                  Examples
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {BENEFIT_TYPES.map((row) => (
                <tr key={row.type}>
                  <td className="py-3 pr-6 align-top font-medium text-ink-deep">
                    {row.type}
                  </td>
                  <td className="py-3 pr-6 align-top text-ink">
                    {row.meaning}
                  </td>
                  <td className="py-3 align-top text-ink">
                    {row.examples}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-8 text-h3 text-ink-deep">
          A Few Real Examples
        </h3>
        <div className="mt-3 space-y-4 text-prose text-ink leading-relaxed">
          <p>
            Panama worked because it solved the fare and gave me enough time
            to see the canal. A Bogota to Rio itinerary with four nights in
            Panama City priced better than the direct flight.
          </p>
          <p>
            Oman worked as a short stop, not as a full holiday. Muscat was
            worth seeing, but the heat changed the way I used the day. That is
            exactly the kind of destination where a stopover can be the right
            amount of time.
          </p>
          <p>
            Turkish Touristanbul is useful for a different reason: it makes a
            first pass through Istanbul easy when you are tired and do not want
            to negotiate the city from scratch.
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-h2 text-ink-deep mb-4">
          Before You Book
        </h2>
        <p className="text-prose text-ink leading-relaxed">
          I would check these before treating the stopover as part of the trip.
          Airline pages change, and small fare-rule details can decide whether
          the hotel exists or whether you are just holding an awkward ticket.
        </p>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-prose leading-relaxed text-ink">
          {BOOKING_CHECKS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <footer className="mt-16 border-t border-sand pt-6 text-micro text-muted">
        <p>
          Last updated {LAST_UPDATED_LABEL}. Check the official airline page
          before booking, especially when the benefit includes a hotel or
          depends on a minimum connection time.
        </p>
      </footer>
    </main>
  );
}
