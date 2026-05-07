import 'server-only';
import { supabaseAdmin } from './supabaseAdmin';

// === Gemini pin-description generator ======================================
// Writes a short factual encyclopedia-style description for a pin in
// Mike's voice. Reuses the Stray `generate-stay-review` edge function
// as a thin Gemini gateway (it just forwards system_prompt + user_prompt
// and returns { review, model }) so we don't deploy a second function
// when the schemas line up.
//
// Returns null on any failure so the caller can fall back to "leave the
// description as-is, retry later".

export type PinDescriptionInput = {
  name: string;
  kind: string | null;
  city: string | null;
  country: string | null;
  /** Existing description, if any. The model is told to rewrite or
   *  improve rather than start fresh when this is non-empty so a partial
   *  description doesn't get thrown away. */
  currentDescription: string | null;
  /** Curated atlas lists this pin sits on (e.g. "unesco-world-heritage",
   *  "wonders-of-the-world"). Strong hint about what the place is. */
  curatedLists: string[];
  /** Saved Google Maps lists. Often city-themed, sometimes thematic
   *  ("coffee shops"). Useful as soft context. */
  savedLists: string[];
  unescoId: number | null;
  unescoUrl: string | null;
  wikipediaUrl: string | null;
  atlasObscuraSlug: string | null;
};

export type PinDescriptionResult = {
  text: string;
  model: string;
};

const SYSTEM_PROMPT = `You write short factual encyclopedia-style descriptions for places in a personal travel atlas.

Constraints:
- 60 to 130 words. Aim for 90. One cohesive paragraph.
- Plain language. No superlatives, hype, or cliches. Avoid words like stunning, iconic, breathtaking, must-see, world-class, unforgettable, hidden gem, charming, vibrant, bustling.
- No em dashes. No idioms. No exclamation points. No rhetorical questions.
- Specificity over abstraction. Say what the place is (architectural style, era, function), where it sits, and one or two concrete details a reader would actually care about.
- If a UNESCO designation, Atlas Obscura listing, or Wikipedia URL is provided, treat those as authoritative for facts but write in your own words.
- Do NOT invent facts you cannot ground in the input or in well-known general knowledge of the place. If the input is sparse and the place is obscure, write only what is defensible and stop early.
- Do not address the reader directly (no "you should", no "imagine"). Do not narrate visits ("I went there"). Describe the place itself.

Output the description text only. No preamble, no headings, no markdown lists.`;

function buildUserPrompt(input: PinDescriptionInput): string {
  const parts: string[] = [];
  parts.push(`Place: ${input.name}`);
  if (input.kind) parts.push(`Kind: ${input.kind}`);
  if (input.city || input.country) {
    parts.push(`Location: ${[input.city, input.country].filter(Boolean).join(', ')}`);
  }
  if (input.unescoId != null) {
    parts.push(`UNESCO World Heritage site (id ${input.unescoId})`);
  }
  if (input.unescoUrl) parts.push(`UNESCO URL: ${input.unescoUrl}`);
  if (input.wikipediaUrl) parts.push(`Wikipedia: ${input.wikipediaUrl}`);
  if (input.atlasObscuraSlug) {
    parts.push(`Atlas Obscura: https://www.atlasobscura.com/places/${input.atlasObscuraSlug}`);
  }
  if (input.curatedLists.length > 0) {
    parts.push(`Curated atlas lists: ${input.curatedLists.join(', ')}`);
  }
  if (input.savedLists.length > 0) {
    parts.push(`Saved-list memberships: ${input.savedLists.join(', ')}`);
  }
  if (input.currentDescription && input.currentDescription.trim()) {
    parts.push(`\nExisting description (rewrite or extend rather than replace wholesale):\n${input.currentDescription.trim()}`);
  }
  parts.push('\nWrite the description now, following the rules in the system instructions.');
  return parts.join('\n');
}

export async function generatePinDescription(
  input: PinDescriptionInput,
): Promise<PinDescriptionResult | null> {
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
        detail = obj?.error
          ? `: ${obj.error}`
          : `: ${JSON.stringify(body).slice(0, 200)}`;
      }
    } catch {
      /* ignore */
    }
    console.error('[geminiPinDescription] edge function failed:', error, detail);
    return null;
  }
  // The edge function uses the field name `review` because it was
  // originally written for hotel reviews; treat it as just "generated
  // text" here.
  const obj = data as { review?: string; model?: string } | null;
  const text = (obj?.review ?? '').trim();
  if (!text) return null;
  return { text, model: obj?.model ?? 'gemini-edge' };
}
