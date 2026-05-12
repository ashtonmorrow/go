// === /languages/[slug] — language guide ====================================
// Per-language guide page: 12 survival phrases plus the country list
// where the language is the primary travel language. Phrases come from
// data/languages.json (populated by `npm run languages:sync`); the
// registry of which languages exist lives in lib/languages.ts.
//
// 7-day ISR is appropriate: phrases don't change unless the sync script
// regenerates them, and a build will pick that up.
//
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { languageBySlug, phrasesForLanguage, LANGUAGES } from '@/lib/languages';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 604800;

// Static-export every populated slug for SSG at build time.
export function generateStaticParams(): { slug: string }[] {
  return LANGUAGES.map(l => ({ slug: l.slug }));
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const language = languageBySlug(slug);
  if (!language) {
    return { title: 'Language guide' };
  }
  return {
    title: `${language.name} travel phrases`,
    description: `Twelve standard travel phrases in ${language.name} (${language.nativeName}) — hello, thank you, where is the bathroom, how much, do you speak English.`,
    alternates: { canonical: `${SITE_URL}/languages/${language.slug}` },
  };
}

export default async function LanguagePage({ params }: PageProps) {
  const { slug } = await params;
  const language = languageBySlug(slug);
  if (!language) notFound();

  const phrases = phrasesForLanguage(language.slug);

  return (
    <main className="max-w-3xl mx-auto px-4 pt-8 pb-16">
      <nav className="text-small text-muted mb-4">
        <Link href="/languages" className="hover:underline">
          ← All languages
        </Link>
      </nav>

      <h1 className="text-h1 text-ink-deep" lang={language.slug}>
        {language.nativeName}
      </h1>
      <p className="text-h3 text-slate font-normal mb-2">{language.name}</p>
      <p className="text-small text-muted mb-8">
        {language.family} language. Travel language in{' '}
        {language.countries.length}{' '}
        {language.countries.length === 1 ? 'country' : 'countries'}.
      </p>

      {phrases.length > 0 ? (
        <section className="mt-2">
          <h2 className="text-h2 text-ink-deep mb-3">Travel phrases</h2>
          <p className="text-small text-slate mb-4 max-w-prose">
            Twelve phrases that earn goodwill in almost any conversation.
            Pronunciation guides intentionally omitted; these are for written
            reference, not for sounding native.
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {phrases.map(({ english, translated }) => (
              <div
                key={english}
                className="flex items-baseline justify-between gap-3 border-b border-sand pb-2"
              >
                <dt className="text-small text-slate">{english}</dt>
                <dd
                  className="text-small text-ink-deep font-medium text-right"
                  lang={language.slug}
                >
                  {translated}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <section className="card p-4 text-small text-muted">
          Phrases for {language.name} have not been generated yet. Run{' '}
          <code>npm run languages:sync -- --only={language.slug}</code> to fill
          them in.
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-h2 text-ink-deep mb-3">Where it&rsquo;s spoken</h2>
        <div className="flex flex-wrap gap-2">
          {language.countries.map(iso => (
            <span key={iso} className="pill bg-cream-soft font-mono text-micro">
              {iso}
            </span>
          ))}
        </div>
        <p className="text-micro text-muted mt-3">
          Country tags use ISO-3166 alpha-2 codes. The list shows where
          {' '}
          {language.name} is the primary travel language; many of these
          countries have additional official or regional languages.
        </p>
      </section>
    </main>
  );
}
