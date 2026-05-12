// === Strict Sunday-closure countries =======================================
// Markets where Sunday trading laws are materially restrictive enough that
// a traveler will notice: shops shuttered, supermarkets closed or
// significantly limited. Curated, not exhaustive. Add a country here only
// when the restriction is the default rather than the exception.
//
// Country codes are ISO-2 uppercase, matching what date.nager.at returns.
//
export const STRICT_SUNDAY_CLOSURE: Record<string, string> = {
  DE: 'Most shops closed on Sundays. Supermarkets close too, with rare exceptions for outlets in train stations, airports, and a small number of tourist zones.',
  AT: 'Most shops closed on Sundays. Bakeries, train-station shops, and some tourist-zone retailers are the typical exceptions.',
  CH: 'Most shops closed on Sundays. The rule varies by canton, but train-station and airport outlets are usually open.',
  PL: 'Most large shops closed on most Sundays under the 2018 trading ban. A handful of Sundays each year (including the lead-up to Christmas and Easter) are exempted.',
};
