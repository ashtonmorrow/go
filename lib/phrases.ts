// === Survival phrases via DeepL =============================================
// Twelve standard travel phrases, translated into the city's primary
// language via the DeepL API. Translation runs once per (target-language)
// combination and is cached at the page level via 30-day ISR. With DeepL
// Free's 500k characters/month, this comfortably supports a few thousand
// distinct city pages.
//
// Returns null whenever DEEPL_API_KEY is missing, the language is
// unsupported, or the API call fails — the panel hides gracefully.
//
// API: https://developers.deepl.com/docs/getting-started/your-first-api-request
//
import { cache } from 'react';

const DEEPL_FREE_API = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_API = 'https://api.deepl.com/v2/translate';

/**
 * The English source phrases, ordered as we want to render them. Order
 * matters: the API returns translations in the same order, and the
 * component pairs them index-for-index.
 */
export const SURVIVAL_PHRASES_EN: readonly string[] = [
  'Hello',
  'Thank you',
  'Yes',
  'No',
  'Please',
  'Excuse me',
  'Where is the bathroom?',
  'How much is it?',
  'Do you speak English?',
  "I don't understand",
  'The bill, please',
  'Cheers!',
] as const;

export type Phrase = {
  english: string;
  translated: string;
};

const DEEPL_KEY = process.env.DEEPL_API_KEY;
// DeepL keys for the free tier end with `:fx`; route those to the free
// endpoint, others to the paid endpoint. Saves a 403 on misrouted keys.
const DEEPL_ENDPOINT = DEEPL_KEY?.endsWith(':fx') ? DEEPL_FREE_API : DEEPL_PRO_API;

export const fetchSurvivalPhrases = cache(
  async (targetLang: string | null | undefined): Promise<Phrase[] | null> => {
    if (!targetLang || !DEEPL_KEY) return null;

    const body = new URLSearchParams();
    body.set('target_lang', targetLang);
    body.set('source_lang', 'EN');
    body.set('preserve_formatting', '1');
    for (const phrase of SURVIVAL_PHRASES_EN) {
      body.append('text', phrase);
    }

    try {
      const res = await fetch(DEEPL_ENDPOINT, {
        method: 'POST',
        body,
        next: { revalidate: 60 * 60 * 24 * 30 }, // 30 days
        headers: {
          Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        translations?: Array<{ text?: string }>;
      };
      const translations = data?.translations ?? [];
      if (translations.length !== SURVIVAL_PHRASES_EN.length) return null;
      return SURVIVAL_PHRASES_EN.map((english, i) => ({
        english,
        translated: translations[i]?.text ?? '',
      }));
    } catch {
      return null;
    }
  },
);
