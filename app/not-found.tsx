import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-prose mx-auto px-5 py-24 text-center">
      <h1 className="text-h1 text-ink-deep">Not here</h1>
      <p className="mt-4 text-slate">Probably somewhere I haven't been yet.</p>
      <Link href="/" className="mt-6 inline-block text-teal">Back to the map</Link>
    </div>
  );
}
