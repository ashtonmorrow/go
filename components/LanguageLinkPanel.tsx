// === LanguageLinkPanel =====================================================
// Compact "the local language is X" panel on city and country pages.
// Renders as a card with the language name + native name and a link to
// the full /languages/[slug] guide. Hides itself for countries with no
// language mapping (typically English-speaking) and when the guide page
// has no phrases yet.
//
import Link from 'next/link';
import { languageByCountry, phrasesForLanguage } from '@/lib/languages';

type Props = {
  countryIso2: string | null;
};

export default function LanguageLinkPanel({ countryIso2 }: Props) {
  const language = languageByCountry(countryIso2);
  if (!language) return null;
  // If the guide page has no phrases yet (script hasn't run for this
  // language), keep the panel hidden rather than linking to an empty page.
  if (phrasesForLanguage(language.slug).length === 0) return null;

  return (
    <section className="mt-8">
      <div className="card p-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-micro text-muted uppercase tracking-wide mb-1">
            Local language
          </div>
          <div className="text-h3 text-ink-deep">
            {language.name}{' '}
            <span className="text-slate font-normal">({language.nativeName})</span>
          </div>
        </div>
        <Link
          href={`/languages/${language.slug}`}
          className="pill bg-cream-soft hover:bg-sand"
        >
          Travel phrases &rarr;
        </Link>
      </div>
    </section>
  );
}
