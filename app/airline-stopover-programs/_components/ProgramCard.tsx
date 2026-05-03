import type { StopoverProgram } from "../_data/programs";
import { ALLIANCE_STYLES } from "../_data/programs";

function HotelBadge({ nights }: { nights: string }) {
  if (!nights || nights === "0") {
    return (
      <span className="inline-flex items-center rounded-full border border-sand px-2 py-0.5 text-label font-medium text-muted">
        No hotel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-label font-semibold text-teal">
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
      className={`rounded-xl border bg-white/60 p-5 shadow-sm transition hover:shadow-md ${
        allianceStyle ? allianceStyle.border : "border-sand"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-h3 text-ink-deep">{program.airline}</h3>
          {program.cities && (
            <p className="mt-0.5 text-small text-muted">{program.cities}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <HotelBadge nights={program.hotelNights} />
          {allianceStyle && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-label font-medium ${allianceStyle.badge}`}
            >
              {allianceStyle.label}
            </span>
          )}
        </div>
      </header>

      {program.commentary && (
        <p className="mt-3 text-body leading-relaxed text-ink">
          {program.commentary}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-micro text-muted">
        {program.duration && (
          <div>
            <dt className="inline font-medium text-muted">
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
          className="mt-4 inline-flex items-center text-small font-medium text-ink-deep underline-offset-4 hover:underline"
        >
          Official program page
        </a>
      )}
    </article>
  );
}
