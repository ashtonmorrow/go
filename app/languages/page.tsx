// === /languages — language index ===========================================
// Index of every language guide the atlas knows. Only the languages
// whose phrases have been populated by `npm run languages:sync` appear
// in the grid; the rest are listed in a muted "coming soon" footer.
//
import Link from 'next/link';
import type { Metadata } from 'next';
import { LANGUAGES, populatedLanguages } from '@/lib/languages';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 604800; // 7 days

export const metadata: Metadata = {
  title: 'Travel phrases by language',
  description:
    'Twelve standard travel phrases — hello, thank you, where is the bathroom — translated for every language the atlas covers.',
  alternates: { canonical: `${SITE_URL}/languages` },
};

export default function LanguagesIndexPage() {
  const populated = populatedLanguages();
  const pending = LANGUAGES.filter(
    l => !populated.find(p => p.slug === l.slug),
  );

  return (
    <main className="max-w-4xl mx-auto px-4 pt-8 pb-16">
      <h1 className="text-h1 text-ink-deep mb-2">Travel phrases</h1>
      <p className="text-prose text-slate mb-8 max-w-prose">
        Twelve standard travel phrases for each language we cover. Hello, thank
        you, please, excuse me, where is the bathroom, how much, do you speak
        English, I don&rsquo;t understand, the bill, cheers. The list a traveler
        actually reaches for.
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {populated.map(l => (
          <li key={l.slug}>
            <Link
              href={`/languages/${l.slug}`}
              className="card p-4 block hover:bg-cream"
            >
              <div className="text-h3 text-ink-deep" lang={l.slug}>
                {l.nativeName}
              </div>
              <div className="text-small text-slate">{l.name}</div>
              <div className="text-micro text-muted mt-1">
                {l.family} · {l.countries.length}{' '}
                {l.countries.length === 1 ? 'country' : 'countries'}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <section className="mt-10">
          <h2 className="text-h3 text-muted mb-2">Coming next</h2>
          <p className="text-small text-muted">
            {pending.map(p => p.name).join(', ')}.
          </p>
        </section>
      )}
    </main>
  );
}
