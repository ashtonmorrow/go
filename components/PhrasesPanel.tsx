// === PhrasesPanel ==========================================================
// "Survival phrases" — twelve standard travel phrases in the city's
// primary language, paired with their English originals. Country → target
// language comes from lib/countryLanguages.ts. Translation runs through
// DeepL via lib/phrases.ts. Both are statically resolved on the server
// and cached via ISR; the component itself has no client state.
//
// Returns null when the country has no language mapping (typically
// English-speaking) or when DeepL is unavailable.
//
import { fetchSurvivalPhrases } from '@/lib/phrases';
import { languageForCountry } from '@/lib/countryLanguages';

type Props = {
  countryIso2: string | null;
};

export default async function PhrasesPanel({ countryIso2 }: Props) {
  const language = languageForCountry(countryIso2);
  if (!language) return null;

  const phrases = await fetchSurvivalPhrases(language.deeplCode);
  if (!phrases || phrases.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep mb-2">A few words in {language.label}</h2>
      <p className="text-small text-slate mb-4">
        Twelve phrases that earn goodwill in almost any conversation. Pronunciation
        guides intentionally omitted — these are for written reference, not for
        sounding native. Translations via DeepL.
      </p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {phrases.map(({ english, translated }) => (
          <div
            key={english}
            className="flex items-baseline justify-between gap-3 border-b border-sand pb-2 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
          >
            <dt className="text-small text-slate">{english}</dt>
            <dd
              className="text-small text-ink-deep font-medium text-right"
              lang={language.deeplCode.toLowerCase().split('-')[0]}
            >
              {translated}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
