import 'server-only';
import { supabaseAdmin } from './supabaseAdmin';

// === Gemini hotel-review generator =========================================
// Takes a stay's structured Q&A + price/room metadata and returns a short
// hotel review in Mike's voice. The prompt and the actual Gemini call
// live in the Stray Supabase edge function `generate-stay-review`,
// matching the pattern parse-reservation already uses, so the Gemini
// API key stays in one place (Stray's edge env). This module owns
// the input/output shape and the prompt text we hand the function.
//
// The prompt deliberately doesn't quote CLAUDE.md verbatim — Mike's
// editorial guide reads better in his own hands than as LLM input.
// What the prompt enforces is the bar: brief, specific, ordered by
// what stood out, no padding, no superlatives.
//
// Returns null on any failure so the caller can fall back to "save the
// Q&A, retry later".

export type StayReviewInput = {
  hotelName: string;
  city: string | null;
  country: string | null;
  roomType: string | null;
  nights: number | null;
  bookingSource: string | null;
  personalRating: number | null;
  wouldStayAgain: boolean | null;
  // The eight prompts. Any can be null/empty; the model is told to
  // ignore missing fields rather than pad them.
  propertyLikes: string | null;
  breakfastNotes: string | null;
  bedNotes: string | null;
  bathroomNotes: string | null;
  amenitiesNotes: string | null;
  specialTouches: string | null;
  locationNotes: string | null;
  travelerAdvice: string | null;
};

export type StayReviewResult = {
  text: string;
  model: string;
};

const SYSTEM_PROMPT = `You write short, specific hotel reviews for a personal travel atlas. The voice is a serious traveler who values clear observation over marketing language.

Constraints:
- 110 to 180 words. Aim for 140. Brief on purpose.
- Plain language. No superlatives, no hype, no cliches. Avoid words like stunning, luxurious, perfect, iconic, absolute gem, must-stay, world-class, breathtaking, unforgettable.
- No em dashes. No idioms. No exclamation points. No rhetorical questions.
- Specificity over abstraction. "Firm bed" beats "comfortable accommodations". "Lobby smelled of sandalwood" beats "lovely atmosphere".
- Order paragraphs by what is most distinctive about THIS property — location, breakfast, an unusual touch, an annoyance, the bed, the bathroom. Do not follow a template.
- If a topic was not noted in the input, leave it out. Do not write filler like "the breakfast was unmemorable" when breakfast notes are blank — just omit breakfast.
- Do not restate the price, dates, or the number of nights. Those render separately on the page.
- First-person voice is fine ("I asked the front desk..."). Do not narrate the trip; describe the property.
- Use complete sentences in cohesive paragraphs. Do not produce a checklist or bulleted output.
- End with a single sentence that helps the reader decide whether to book — who this property suits, or what to know before booking. Skip if the input does not support a useful one.

Output the review text only. No preamble, no headings, no markdown lists.`;

function buildUserPrompt(input: StayReviewInput): string {
  const parts: string[] = [];
  parts.push(`Hotel: ${input.hotelName}`);
  if (input.city || input.country) {
    parts.push(`Location: ${[input.city, input.country].filter(Boolean).join(', ')}`);
  }
  if (input.roomType) parts.push(`Room type: ${input.roomType}`);
  if (input.nights) parts.push(`Nights: ${input.nights}`);
  if (input.bookingSource) parts.push(`Booking source: ${input.bookingSource}`);
  if (input.personalRating != null) {
    parts.push(`Mike's rating: ${input.personalRating}/5`);
  }
  if (input.wouldStayAgain != null) {
    parts.push(`Would stay again: ${input.wouldStayAgain ? 'yes' : 'no'}`);
  }

  const qa: { label: string; value: string | null }[] = [
    { label: 'What I liked about the property', value: input.propertyLikes },
    { label: 'Breakfast', value: input.breakfastNotes },
    { label: 'Bed', value: input.bedNotes },
    { label: 'Bathroom', value: input.bathroomNotes },
    { label: 'Amenities', value: input.amenitiesNotes },
    { label: 'Anything special or different', value: input.specialTouches },
    { label: 'Location', value: input.locationNotes },
    { label: 'Anything a traveler should know before booking', value: input.travelerAdvice },
  ];
  const filled = qa.filter(q => !!(q.value && q.value.trim()));
  if (filled.length > 0) {
    parts.push('\nMy notes:');
    for (const q of filled) {
      parts.push(`  ${q.label}: ${q.value!.trim()}`);
    }
  }

  parts.push(
    '\nWrite the review now, following the rules in the system instructions.',
  );
  return parts.join('\n');
}

export async function generateStayReview(
  input: StayReviewInput,
): Promise<StayReviewResult | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.functions.invoke('generate-stay-review', {
    body: {
      system_prompt: SYSTEM_PROMPT,
      user_prompt: buildUserPrompt(input),
    },
  });
  if (error) {
    let detail = '';
    try {
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as { json?: unknown }).json === 'function') {
        const body = await (ctx as { json: () => Promise<unknown> }).json();
        const obj = body as { error?: string };
        detail = obj?.error ? `: ${obj.error}` : `: ${JSON.stringify(body).slice(0, 200)}`;
      }
    } catch {
      /* ignore */
    }
    console.error('[geminiReview] edge function failed:', error, detail);
    return null;
  }
  const obj = data as { review?: string; model?: string } | null;
  const text = (obj?.review ?? '').trim();
  if (!text) return null;
  return { text, model: obj?.model ?? 'gemini-edge' };
}
