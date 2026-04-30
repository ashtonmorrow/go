import ReservationParserClient from './ReservationParserClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminReservationNew() {
  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Add past stay</h1>
      <p className="text-small text-muted mb-6 max-w-2xl leading-relaxed">
        Drop one or many hotel confirmation PDFs. Each is read by Gemini, the
        hotel + year + nights + room type + per-night rate are extracted, and a
        pin is created (or updated if it already exists). Names, dates,
        confirmation numbers, and any other personal info are scrubbed before save.
      </p>
      <ReservationParserClient />
    </div>
  );
}
