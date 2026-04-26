// === Live currency conversion =============================================
// Fetches a USD → target rate from fawazahmed0/currency-api, a free,
// no-key, MIT-licensed exchange rate API served via jsDelivr. Updates
// daily at the source.
//
// We pull the full USD-base table once and the country pages each ask
// for whatever 3-letter ISO 4217 code matches their currency. Cached
// 24 hours via Next ISR.
//
// API:  https://github.com/fawazahmed0/currency-api
//
import { cache } from 'react';

const FX_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

type FxResponse = {
  date: string;
  usd: Record<string, number>;
};

export const fetchUsdRates = cache(async (): Promise<FxResponse | null> => {
  try {
    const res = await fetch(FX_URL, {
      next: { revalidate: 60 * 60 * 24 }, // 24 h
      headers: {
        'User-Agent': 'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
      },
    });
    if (!res.ok) return null;
    const data: FxResponse = await res.json();
    return data;
  } catch {
    return null;
  }
});

/**
 * Resolve a country's currency text (e.g. "EUR", "Japanese Yen", "JPY")
 * to a lowercase ISO 4217 code the FX API can match. Most Notion records
 * already store the code; this is a defensive fallback for ones that
 * don't.
 */
export function normaliseCurrency(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim();
  if (!t) return null;
  // Already a 3-letter code? lowercase and ship.
  if (/^[A-Za-z]{3}$/.test(t)) return t.toLowerCase();
  // Currency-name fallback. Add as needed; misses just hide the widget.
  const map: Record<string, string> = {
    'us dollar': 'usd',
    euro: 'eur',
    pound: 'gbp',
    'pound sterling': 'gbp',
    'british pound': 'gbp',
    yen: 'jpy',
    'japanese yen': 'jpy',
    yuan: 'cny',
    'australian dollar': 'aud',
    'canadian dollar': 'cad',
    'swiss franc': 'chf',
  };
  return map[t.toLowerCase()] ?? null;
}
