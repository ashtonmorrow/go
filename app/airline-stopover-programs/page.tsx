import type { Metadata } from "next";

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

const PAGE_TITLE = "Airline stopover programs";
const PAGE_DESCRIPTION =
  "A reference of major airline stopover programs, listing hotel nights included, validity windows, and stopover cities for each carrier.";

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
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
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

function StructuredData() {
  const verified = PROGRAMS.filter((p) => !p.isStub);

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
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

      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
          {PAGE_TITLE}
        </h1>
      </header>

      {/* ── Cheat sheet ─────────────────────────────────────────── */}
      <div id="cheat-sheet-top" className="scroll-mt-24" />
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
              <header className="mb-4 flex items-baseline gap-3 border-b border-gray-200 pb-2 dark:border-gray-800">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${style.dot}`}
                  aria-hidden="true"
                />
                <h2
                  id={`${sectionId}-heading`}
                  className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100"
                >
                  {style.label}
                </h2>
                <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                  {programs.length}{" "}
                  {programs.length === 1 ? "program" : "programs"}
                </span>
              </header>
              <div className="grid gap-4 sm:grid-cols-2">
                {programs.map((p) => (
                  <div key={p.airline} id={airlineSlug(p.airline)} className="scroll-mt-24">
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
          className="mt-16 scroll-mt-24 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-5 dark:border-gray-700 dark:bg-gray-900/40"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Programs pending verification
          </h2>
          <ul className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2 dark:text-gray-300">
            {stubs.map((p) => {
              const allianceStyle = p.alliance
                ? ALLIANCE_STYLES[p.alliance]
                : null;
              return (
                <li
                  key={p.airline}
                  className="flex items-center justify-between rounded-md bg-white px-3 py-2 dark:bg-gray-950/40"
                >
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {p.airline}
                  </span>
                  {allianceStyle && (
                    <span
                      className={`text-[11px] font-medium ${allianceStyle.badge} rounded-full px-2 py-0.5`}
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
      <footer className="mt-16 border-t border-gray-200 pt-6 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <p>Last updated {LAST_UPDATED_LABEL}.</p>
      </footer>
    </main>
  );
}
