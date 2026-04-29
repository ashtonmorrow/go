import { currencySymbol } from './currencySymbol';
import type { Pin, PinAdmission, PinPriceDetails } from './pins';

export type AdmissionTier = {
  label: string;
  amount: number;
  formatted: string;
};

export type AdmissionView =
  | { kind: 'free'; note: string | null; notes: string[] }
  | { kind: 'paid'; tiers: AdmissionTier[]; currency: string | null; note: string | null; notes: string[] }
  | { kind: 'unknown' };

const TIER_ORDER: Array<keyof PinAdmission> = ['adult', 'student', 'senior', 'child'];
const TIER_LABEL: Record<string, string> = {
  adult: 'Adults',
  child: 'Children',
  senior: 'Seniors',
  student: 'Students',
};

function fmtMoney(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString();
  const symbol = currencySymbol(currency);
  if (symbol && symbol !== currency) return `${symbol}${amount.toLocaleString()}`;
  return `${amount.toLocaleString()} ${currency}`;
}

function viewFromPriceDetails(pd: PinPriceDetails): AdmissionView {
  const notes = Array.isArray(pd.notes) ? pd.notes.filter(Boolean) : [];
  if (pd.type === 'free') {
    return { kind: 'free', note: notes[0] ?? null, notes };
  }
  const tiers: AdmissionTier[] = [];
  if (pd.baseline && typeof pd.baseline.amount === 'number') {
    tiers.push({
      label: pd.baseline.label || 'Adult',
      amount: pd.baseline.amount,
      formatted: fmtMoney(pd.baseline.amount, pd.baseline.currency),
    });
  }
  if (Array.isArray(pd.variants)) {
    for (const v of pd.variants) {
      if (!v || typeof v.amount !== 'number') continue;
      tiers.push({
        label: v.label || 'Variant',
        amount: v.amount,
        formatted: fmtMoney(v.amount, v.currency),
      });
    }
  }
  return {
    kind: 'paid',
    tiers,
    currency: pd.baseline?.currency ?? null,
    note: notes[0] ?? null,
    notes,
  };
}

export function admissionView(pin: Pin): AdmissionView {
  // Codex's price_details takes precedence — richer shape with variants.
  if (pin.priceDetails) return viewFromPriceDetails(pin.priceDetails);

  // Codex's free_to_visit is a strict yes/no.
  if (pin.freeToVisit === true) {
    return { kind: 'free', note: null, notes: [] };
  }

  // Original admission jsonb (4-tier).
  const admission = pin.admission;
  const legacyCurrency = pin.priceCurrency;
  if (admission) {
    const tiers: AdmissionTier[] = [];
    for (const key of TIER_ORDER) {
      const v = admission[key];
      if (typeof v === 'number') {
        tiers.push({
          label: TIER_LABEL[key as string] ?? String(key),
          amount: v,
          formatted: fmtMoney(v, admission.currency ?? legacyCurrency),
        });
      }
    }
    if (tiers.length || admission.notes) {
      return {
        kind: 'paid',
        tiers,
        currency: admission.currency ?? legacyCurrency,
        note: admission.notes ?? null,
        notes: admission.notes ? [admission.notes] : [],
      };
    }
  }

  if (pin.free === true) return { kind: 'free', note: pin.priceText ?? null, notes: [] };

  if (typeof pin.priceAmount === 'number' && pin.priceAmount >= 0) {
    if (pin.priceAmount === 0) return { kind: 'free', note: pin.priceText, notes: [] };
    return {
      kind: 'paid',
      tiers: [{ label: 'Admission', amount: pin.priceAmount, formatted: fmtMoney(pin.priceAmount, legacyCurrency) }],
      currency: legacyCurrency,
      note: pin.priceText,
      notes: [],
    };
  }

  if (pin.priceText && /\bfree\b/i.test(pin.priceText)) {
    return { kind: 'free', note: pin.priceText, notes: [] };
  }

  if (pin.priceText) {
    return { kind: 'paid', tiers: [], currency: legacyCurrency, note: pin.priceText, notes: [] };
  }

  return { kind: 'unknown' };
}

export function admissionShortLabel(view: AdmissionView): string | null {
  if (view.kind === 'free') return 'Free';
  if (view.kind === 'unknown') return null;
  if (view.tiers.length === 0) return view.note ?? null;
  const adult = view.tiers.find(t => t.label === 'Adults') ?? view.tiers[0];
  return adult.formatted;
}
