// Supabase edge function: generate-stay-review
//
// Drop this file at supabase/functions/generate-stay-review/index.ts in the
// Stray repo and deploy with `supabase functions deploy generate-stay-review`.
//
// Reads the Gemini API key from the same edge env as parse-reservation
// (GEMINI_API_KEY). Accepts a system prompt + user prompt from the
// caller (the go.mike-lee.me Next app passes them in via
// /api/admin/hotel-stays/generate-review), calls Gemini's REST API,
// returns { review, model }.
//
// Why a thin pass-through rather than holding the prompt server-side:
// the prompt and input shape are owned by the caller's lib/geminiReview.ts.
// The edge function exists only to keep the Gemini API key out of the
// caller's Vercel env, matching parse-reservation's split.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_MODEL = "gemini-2.0-flash";

type RequestBody = {
  system_prompt?: string;
  user_prompt?: string;
};

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const systemPrompt = (body.system_prompt ?? "").trim();
  const userPrompt = (body.user_prompt ?? "").trim();
  if (!systemPrompt || !userPrompt) {
    return json({ error: "system_prompt and user_prompt required" }, 400);
  }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    return json({ error: "GEMINI_API_KEY not set in edge env" }, 500);
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${
      encodeURIComponent(key)
    }`;
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    generationConfig: {
      temperature: 0.6,
      // ~180 words ≈ 240 tokens; cap above so the last sentence finishes.
      maxOutputTokens: 360,
      topP: 0.9,
    },
    safetySettings: [],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json({ error: `gemini fetch failed: ${String(err)}` }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json(
      { error: `gemini ${res.status}: ${detail.slice(0, 300)}` },
      502,
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return json({ error: "gemini returned non-JSON" }, 502);
  }
  const text =
    (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? "")
      .join("")
      .trim();
  if (!text) return json({ error: "empty model output" }, 502);

  return json({ review: text, model: GEMINI_MODEL });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
