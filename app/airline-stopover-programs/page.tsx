import type { Metadata } from "next";
import Link from "next/link";

import { AllianceFilter } from "./_components/AllianceFilter";
import { ProgramCard } from "./_components/ProgramCard";
import {
  ALLIANCES,
  ALLIANCE_STYLES,
  PROGRAMS,
  groupByAlliance,
  getStubs,
} from "./_data/programs";

const LAST_UPDATED = "April 2026";

export const metadata: Metadata = {
  title: "Airline stopover programs — a one-page cheat sheet",
  description:
    "Every major airline's stopover program in one place: which ones include a free hotel, how long you can stay, and what to watch out for. Updated " +
    LAST_UPDATED +
    ".",
  openGraph: {
    title: "Airline stopover programs — a one-page cheat sheet",
    description:
      "Two trips for the price of one — sometimes with a free hotel. The full cheat sheet, side-by-side by alliance.",
    type: "article",
  },
  alternates: {
    canonical: "/airline-stopover-programs",
  },
};

export default function AirlineStopoverProgramsPage() {
  const grouped = groupByAlliance(PROGRAMS);
  const stubs = getStubs(PROGRAMS);

  const counts = {
    "Star Alliance": grouped["Star Alliance"].length,
    oneworld: grouped.oneworld.length,
    SkyTeam: grouped.SkyTeam.length,
    "Non aligned": grouped["Non aligned"].length,
  };

  const totalListed = PROGRAMS.filter((p) => !p.isStub).length;
  const withHotel = PROGRAMS.filter(
    (p) => !p.isStub && p.hotelNights && p.hotelNights !== "0"
  ).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Travel cheat sheet
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
          Airline stopover programs
        </h1>
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">
          Two trips for the price of one — sometimes with a free hotel. The
          catch is in the fine print, so here&apos;s every major program
          side-by-side.
        </p>
      </header>

      {/* ── Intro prose ─────────────────────────────────────────── */}
      <section className="space-y-4 text-[17px] leading-relaxed text-gray-800 dark:text-gray-200">
        <p>
          A stopover program lets you break a long international flight into
          two trips at no extra airfare. Instead of suffering an overnight
          layover in a hub city, you turn it into a two- or three-day visit
          on the way to where you were already going. Some airlines sweeten
          the deal with a free hotel and meals; others just give you
          permission to stop without repricing the ticket.
        </p>
        <p>
          The annoying thing is that every airline structures their program
          differently, and the marketing language is uniformly vague about
          which one you&apos;re actually getting. So I built this page to
          line them all up. Of the {totalListed} programs listed below,{" "}
          <strong>{withHotel} include a complimentary hotel</strong> for
          eligible passengers. The rest are routing perks — useful, but not a
          free vacation.
        </p>
        <div className="my-6 rounded-lg border-l-4 border-gray-900 bg-gray-50 px-4 py-3 text-[15px] text-gray-700 dark:border-gray-100 dark:bg-gray-900/60 dark:text-gray-300">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            Three things to know before booking
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              <strong>Routing matters.</strong> A stopover almost always has
              to happen at the carrier&apos;s hub. A Turkish stopover means
              flying Turkish Airlines through Istanbul. You can&apos;t bolt a
              Doha stopover onto a Lufthansa ticket.
            </li>
            <li>
              <strong>&ldquo;Free hotel&rdquo; has fine print.</strong>{" "}
              Eligible fare class, minimum cabin, length of layover, partner
              hotels only — read the program page before counting on it.
            </li>
            <li>
              <strong>Programs change.</strong> Always confirm on the
              airline&apos;s own page (linked on each card) before booking.
            </li>
          </ol>
        </div>
      </section>

      {/* ── Cheat sheet ─────────────────────────────────────────── */}
      <div id="cheat-sheet-top" className="scroll-mt-24" />
      <AllianceFilter counts={counts} />

      <div className="space-y-12">
        {ALLIANCES.map((alliance) => {
          const programs = grouped[alliance];
          if (programs.length === 0) return null;
          const style = ALLIANCE_STYLES[alliance];
          return (
            <section
              key={alliance}
              id={
                alliance === "Star Alliance"
                  ? "star-alliance"
                  : alliance === "Non aligned"
                    ? "non-aligned"
                    : alliance.toLowerCase()
              }
              className="scroll-mt-24"
              aria-labelledby={`${alliance.replace(/\s+/g, "-").toLowerCase()}-heading`}
            >
              <header className="mb-4 flex items-baseline gap-3 border-b border-gray-200 pb-2 dark:border-gray-800">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${style.dot}`}
                  aria-hidden="true"
                />
                <h2
                  id={`${alliance.replace(/\s+/g, "-").toLowerCase()}-heading`}
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
                  <ProgramCard key={p.airline} program={p} />
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
            Still researching
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Programs I know exist but haven&apos;t fully verified yet. Holler
            if you have first-hand experience with any of these.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2 dark:text-gray-300">
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
      <footer className="mt-16 border-t border-gray-200 pt-6 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <p>
          Last updated {LAST_UPDATED}. Programs change frequently — confirm on
          the airline&apos;s page before booking. Spotted an error or know of
          a program I missed?{" "}
          <Link href="/" className="underline-offset-4 hover:underline">
            Get in touch.
          </Link>
        </p>
      </footer>
    </main>
  );
}
