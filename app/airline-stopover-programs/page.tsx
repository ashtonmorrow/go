import type { Metadata } from "next";
import Image from "next/image";

import { AllianceFilter } from "./_components/AllianceFilter";
import { ProgramCard } from "./_components/ProgramCard";
import {
  ALLIANCES,
  ALLIANCE_STYLES,
  PROGRAMS,
  groupByAlliance,
  getStubs,
} from "./_data/programs";

const SITE_URL = "https://go.mike-lee.me";
const PAGE_PATH = "/airline-stopover-programs";
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
const PUBLISHED_ISO = "2026-04-30";
const UPDATED_ISO = "2026-04-30";
const LAST_UPDATED_LABEL = "April 30, 2026";
const AUTHOR_NAME = "Mike Lee";

// Hero photo — Mike's own shot from a mosque visited on an Oman Air stopover
// in Muscat. Lives in /public so Next/Image can serve responsive variants and
// social platforms can fetch the absolute URL for previews.
const HERO_IMAGE = "/images/posts/airline-stopover-programs.jpg";
const HERO_IMAGE_URL = `${SITE_URL}${HERO_IMAGE}`;
const HERO_ALT =
  "A mosque visited during an Oman Air stopover in Muscat — a real-world example of breaking up a long-haul into a short trip.";

const PAGE_TITLE = "The Ultimate Airline Stopover Cheat Sheet";
const PAGE_DESCRIPTION =
  "A reference for travelers planning stopovers: terminology, the alliance landscape, programs I have used personally, and a side-by-side comparison of every major airline stopover program.";

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

const TERMINOLOGY: { term: string; definition: string }[] = [
  {
    term: "Nonstop flight",
    definition:
      "A flight from origin to destination with no intermediate stops.",
  },
  {
    term: "Direct flight",
    definition:
      "A single flight number that may include intermediate stops, with passengers staying on the same aircraft throughout.",
  },
  {
    term: "Layover",
    definition:
      "A connection between two flights of less than 24 hours, used only to transfer to the onward flight.",
  },
  {
    term: "Stopover",
    definition:
      "A connection of more than 24 hours, often planned in advance to spend time in the connecting city. The basis of the airline programs listed below.",
  },
];

function StructuredData() {
  const verified = PROGRAMS.filter((p) => !p.isStub);

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
    numberOfItems: verified.length,
    itemListElement: verified.map((p, i) => ({
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
    </>
  );
}

export default function AirlineStopoverProgramsPage() {
  const grouped = groupByAlliance(PROGRAMS);
  const stubs = getStubs(PROGRAMS);

  const counts = {
    "Star Alliance": grouped["Star Alliance"].length,
    oneworld: grouped.oneworld.length,
    SkyTeam: grouped.SkyTeam.length,
    "Non aligned": grouped["Non aligned"].length,
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <StructuredData />

      {/* Hero — Mike's mosque shot from an Oman Air stopover. Eager-loaded
          and given high priority because it's above the fold and the LCP
          element on this page. */}
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
      </header>

      {/* ── Terminology ─────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-h2 text-ink-deep mb-4">
          Stopover, layover, direct, nonstop
        </h2>
        <p className="text-prose text-ink leading-relaxed">
          The terms get used loosely in airline marketing and even in casual
          conversation. Before getting to the programs themselves, here are
          the four distinctions that actually matter when reading fare rules
          or deciding which itinerary to book.
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
                <tr key={row.term}>
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
      </section>

      {/* ── Alliances ───────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-4">
          Alliances and their hubs
        </h2>
        <p className="text-prose text-ink leading-relaxed">
          Airlines join alliances to cooperate on ticketing, lounge access,
          and miles. For stopover programs, the practical effect is that each
          program is anchored at the carrier&apos;s hub: an Istanbul stopover
          requires flying Turkish Airlines, a Doha stopover requires Qatar,
          and so on. The alliance affiliation tells you which other carriers
          can route you into that hub on a single ticket. Star Alliance,
          oneworld, and SkyTeam each cover several stopover hubs. Emirates,
          Etihad, Icelandair, and China Southern run programs outside any
          alliance. The buttons below jump to each section.
        </p>
      </section>

      <div id="cheat-sheet-top" className="scroll-mt-24" />
      <AllianceFilter counts={counts} />

      {/* ── Programs I have used ────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-h2 text-ink-deep mb-4">
          Programs I have used
        </h2>
        <div className="space-y-4 text-prose text-ink leading-relaxed">
          <p>
            I have used four of these programs personally so far: Oman Air,
            Qatar, Turkish, and Copa. The point of the rest of this page is
            the data, but a couple of concrete examples are useful for
            showing why the program structure matters in practice.
          </p>
          <p>
            Oman Air is the clearest case. Muscat is not a city most people
            would build a vacation around, but the program let me spend
            roughly a day and a half at the Holiday Inn Express 15 minutes
            from the airport. The ticket was inexpensive, and breaking the
            journey into two non-stop flights meant I arrived in Kuala Lumpur
            rested rather than worn down by overnight transit.
          </p>
          <p>
            Copa worked the same way for Panama City. I added a couple of
            days, saw the Panama Canal on my birthday, and got a real sense
            of a place I would not have gone out of my way to visit. The
            pattern across both stopovers is the same: the airline routing
            you would already have chosen turns into a short, low-pressure
            trip to a city you would otherwise skip.
          </p>
        </div>
      </section>

      {/* ── Cheat sheet (alliance-grouped cards) ────────────────── */}
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

      {/* ── Researching ─────────────────────────────────────────── */}
      {stubs.length > 0 && (
        <section
          id="researching"
          className="mt-16 scroll-mt-24 rounded-xl border border-dashed border-sand bg-cream-soft/60 p-5"
        >
          <h2 className="text-h3 text-ink-deep">
            Programs pending verification
          </h2>
          <ul className="mt-3 grid gap-2 text-small text-ink sm:grid-cols-2">
            {stubs.map((p) => {
              const allianceStyle = p.alliance
                ? ALLIANCE_STYLES[p.alliance]
                : null;
              return (
                <li
                  key={p.airline}
                  className="flex items-center justify-between rounded-md bg-white px-3 py-2"
                >
                  <span className="font-medium text-ink-deep">
                    {p.airline}
                  </span>
                  {allianceStyle && (
                    <span
                      className={`text-label font-medium ${allianceStyle.badge} rounded-full px-2 py-0.5`}
                    >
                      {allianceStyle.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Footer note ─────────────────────────────────────────── */}
      <footer className="mt-16 border-t border-sand pt-6 text-micro text-muted">
        <p>Last updated {LAST_UPDATED_LABEL}.</p>
      </footer>
    </main>
  );
}
