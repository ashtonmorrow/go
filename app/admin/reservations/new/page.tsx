import ReservationParserClient from './ReservationParserClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminReservationNew() {
  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Add past stay</h1>
      <p className="text-small text-muted mb-6 max-w-2xl leading-relaxed">
        Paste a hotel confirmation email body. We extract the hotel, year, nights,
        room type, and per-night rate, then drop you into the editor with everything
        prefilled. Names, dates, confirmation numbers, and other personal info are
        scrubbed before save.
      </p>
      <ReservationParserClient />
    </div>
  );
}
