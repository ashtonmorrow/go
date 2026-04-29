import { currencySymbol } from './currencySymbol';
import type { PinAdmission } from './pins';

export type AdmissionTier = {
  label: string;
  amount: number;
  formatted: string;
};

export type AdmissionView =
  | { kind: 'free'; note: string | null }
  | { kind: 'paid'; tiers: AdmissionTier[]; currency: string | null; note: string | null }
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

export function admissionView(
  admission: PinAdmission | null,
  free: boolean | null,
  legacyText: string | null,
  legacyAmount: number | null,
  legacyCurrency: string | null,
): AdmissionView {
  if (free === true) {
    return { kind: 'free', note: admission?.notes ?? legacyText ?? null };
  }

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
      };
    }
  }

  if (typeof legacyAmount === 'number' && legacyAmount >= 0) {
    if (legacyAmount === 0) return { kind: 'free', note: legacyText };
    return {
      kind: 'paid',
      tiers: [{ label: 'Admission', amount: legacyAmount, formatted: fmtMoney(legacyAmount, legacyCurrency) }],
      currency: legacyCurrency,
      note: legacyText,
    };
  }

  if (legacyText && /\bfree\b/i.test(legacyText)) {
    return { kind: 'free', note: legacyText };
  }

  if (legacyText) {
    return { kind: 'paid', tiers: [], currency: legacyCurrency, note: legacyText };
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
