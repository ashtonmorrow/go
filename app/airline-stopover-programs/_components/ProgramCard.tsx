import type { StopoverProgram } from "../_data/programs";
import { ALLIANCE_STYLES } from "../_data/programs";

function HotelBadge({ nights }: { nights: string }) {
  if (!nights || nights === "0") {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-400">
        No hotel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
      {nights} {nights === "1" ? "night" : "nights"} included
    </span>
  );
}

export function ProgramCard({ program }: { program: StopoverProgram }) {
  const allianceStyle = program.alliance
    ? ALLIANCE_STYLES[program.alliance]
    : null;

  return (
    <article
      className={`rounded-xl border bg-white/60 p-4 shadow-sm transition hover:shadow-md sm:p-5 dark:bg-gray-900/40 ${
        allianceStyle ? allianceStyle.border : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {program.airline}
          </h3>
          {program.cities && (
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              {program.cities}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <HotelBadge nights={program.hotelNights} />
          {allianceStyle && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${allianceStyle.badge}`}
            >
              {allianceStyle.label}
            </span>
          )}
        </div>
      </header>

      {program.commentary && (
        <p className="mt-3 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
          {program.commentary}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        {program.duration && (
          <div>
            <dt className="inline font-medium text-gray-500 dark:text-gray-500">
              Validity:{" "}
            </dt>
            <dd className="inline">{program.duration}</dd>
          </div>
        )}
      </dl>

      {program.programUrl && (
        <a
          href={program.programUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center text-sm font-medium text-gray-900 underline-offset-4 hover:underline dark:text-gray-100"
        >
          Official program page
        </a>
      )}
    </article>
  );
}
