import 'server-only';

// === Gemini hotel-review generator =========================================
// Takes a stay's structured Q&A + price/room metadata and returns a short
// hotel review in Mike's voice. The prompt holds the rules; this module
// owns the API call and the input/output shape.
//
// The prompt deliberately doesn't quote CLAUDE.md verbatim — Mike's
// editorial guide reads better in his own hands than as LLM input. What
// the prompt enforces is the bar: brief, specific, ordered by what
// stood out, no padding, no superlatives.
//
// API: Google's REST endpoint for Gemini 1.5 Flash. Set GEMINI_API_KEY
// in the Vercel project. Returns null on any failure so the caller can
// fall back to "save the Q&A, ask again later".

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

const GEMINI_MODEL = 'gemini-2.0-flash';

export async function generateStayReview(
  input: StayReviewInput,
): Promise<StayReviewResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('[geminiReview] GEMINI_API_KEY not set');
    return null;
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildUserPrompt(input) }],
      },
    ],
    generationConfig: {
      temperature: 0.6,
      // 180 words ≈ 240 tokens; cap a bit above so the model can finish
      // a sentence without truncation.
      maxOutputTokens: 360,
      topP: 0.9,
    },
    safetySettings: [],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[geminiReview] network error:', err);
    return null;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(
      `[geminiReview] non-ok response (${res.status}): ${detail.slice(0, 300)}`,
    );
    return null;
  }

  type GeminiResponse = {
    candidates?: {
      content?: { parts?: { text?: string }[] };
    }[];
  };
  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    return null;
  }
  const text =
    data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('').trim() ?? '';
  if (!text) return null;
  return { text, model: GEMINI_MODEL };
}
