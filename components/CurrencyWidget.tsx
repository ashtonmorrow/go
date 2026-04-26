// === CurrencyWidget ========================================================
// Inline live exchange-rate readout for a country page sidebar. Resolves
// the country's currency to an ISO-4217 code, pulls the USD-base rate
// table from fawazahmed0/currency-api (24 h ISR cache), and shows
// "1 USD = X CUR". If the rate isn't resolvable (unknown currency, API
// down, USD itself), the widget renders nothing rather than an error
// state — quiet failure is better than visual clutter on every page.
//
// Server-component; no client JS shipped for the readout itself.
//
import { fetchUsdRates, normaliseCurrency } from '@/lib/exchangeRate';

type Props = {
  /** Country.currency from Notion — usually a 3-letter code, sometimes a name. */
  currency: string | null | undefined;
};

export default async function CurrencyWidget({ currency }: Props) {
  const code = normaliseCurrency(currency);
  if (!code || code === 'usd') return null;

  const fx = await fetchUsdRates();
  const rate = fx?.usd?.[code];
  if (!rate || !Number.isFinite(rate)) return null;

  // Decimal precision: high-value currencies (>1 per USD) get 2 dp; weaker
  // ones get 0 dp so we don't show "= 17,432.18 IDR" with cents.
  const display =
    rate >= 1
      ? rate.toFixed(2)
      : Intl.NumberFormat('en').format(Math.round(rate * 10000) / 10000);
  const intDisplay =
    rate >= 50 ? Math.round(rate).toLocaleString('en') : display;

  return (
    <div className="card p-4 text-small">
      <div className="text-muted uppercase tracking-wider text-[11px]">Exchange rate</div>
      <div className="mt-2 text-ink-deep">
        <span className="font-mono">1&nbsp;USD</span>
        <span className="text-slate"> = </span>
        <span className="font-mono">{intDisplay}</span>
        <span className="text-slate"> {code.toUpperCase()}</span>
      </div>
      {fx?.date && (
        <div className="mt-1 text-muted text-[11px]">As of {fx.date}.</div>
      )}
    </div>
  );
}
