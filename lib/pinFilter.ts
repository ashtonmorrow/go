// === Shared pin filter + sort logic ========================================
// Lives outside any one view component so PinsGrid (cards), PinsTable, and
// PinsMap all run the same axes — search, visited, UNESCO, category,
// country — without duplicating the predicates. Callers pass the
// PinFilterState from PinFiltersContext and receive a filtered + sorted
// list back.
//
// Generic over T so each view can shape its data however it wants, as
// long as the structural fields the filters need are present.
import type { PinFilterState } from '@/components/PinFiltersContext';

export type PinFilterable = {
  name: string;
  description?: string | null;
  cityNames?: string[];
  statesNames?: string[];
  category?: string | null;
  visited: boolean;
  unescoId?: number | null;
  airtableModifiedAt?: string | null;
  updatedAt?: string | null;
};

export function filterPins<T extends PinFilterable>(pins: T[], state: PinFilterState): T[] {
  const needle = state.q.trim().toLowerCase();
  const out: T[] = [];
  for (const p of pins) {
    // q match — name, description, city, country names
    if (needle) {
      const hay = (
        p.name + '\n' +
        (p.description ?? '') + '\n' +
        (p.cityNames ?? []).join(' ') + '\n' +
        (p.statesNames ?? []).join(' ')
      ).toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    if (state.visitedFilter === 'visited' && !p.visited) continue;
    if (state.visitedFilter === 'not-visited' && p.visited) continue;
    if (state.unescoOnly && p.unescoId == null) continue;
    if (state.categories.size > 0 && (!p.category || !state.categories.has(p.category))) continue;
    if (state.countries.size > 0) {
      const country = (p.statesNames ?? [])[0];
      if (!country || !state.countries.has(country)) continue;
    }
    out.push(p);
  }
  return out;
}

export function sortPins<T extends PinFilterable>(pins: T[], state: PinFilterState): T[] {
  const out = [...pins];
  out.sort((a, b) => {
    let cmp = 0;
    if (state.sort === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else {
      // 'recent' — by airtable_modified_at, fall back to updated_at;
      // missing values sort last regardless of direction.
      const A = a.airtableModifiedAt ?? a.updatedAt ?? '';
      const B = b.airtableModifiedAt ?? b.updatedAt ?? '';
      if (!A && !B) cmp = 0;
      else if (!A) cmp = 1;
      else if (!B) cmp = -1;
      else cmp = A < B ? -1 : A > B ? 1 : 0;
    }
    return state.desc ? -cmp : cmp;
  });
  return out;
}
