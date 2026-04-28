// === parseHours ===========================================================
// Pin hours come from Airtable in two formats:
//
//   1. Structured weekly schedule:
//      Sun: Closed
//      Mon: 05:30–02:00
//      Tue: 05:30–02:00 ...
//
//   2. Free-form prose ("Open daily from 8 AM to 6 PM", "Generally open
//      6:00 AM to 6:00 PM with seasonal variation", etc.)
//
// We parse the structured form into a 7-day array so views can show
// "Open today 10–6" / "Closed today" inline. Prose stays as-is and is
// shown verbatim on the detail page.

const DAY_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEY)[number];

export type DayHours = {
  day: DayKey;
  /** "10:00" or null when closed/unknown. */
  open: string | null;
  /** "18:00" or null when closed/unknown. */
  close: string | null;
  /** True when the schedule explicitly says "Closed". */
  closed: boolean;
};

export type ParsedHours = {
  /** 7-day array when we could parse the structured format. Null when
   *  the source is prose. Always sun..sat order; missing days dropped. */
  structured: DayHours[] | null;
  /** The raw text from the source — always preserved so callers can
   *  fall through to "show the prose verbatim" when structured is null. */
  prose: string;
};

const DAY_NAME_TO_KEY: Record<string, DayKey> = {
  sun: 'sun', sunday: 'sun',
  mon: 'mon', monday: 'mon',
  tue: 'tue', tues: 'tue', tuesday: 'tue',
  wed: 'wed', wednesday: 'wed',
  thu: 'thu', thurs: 'thu', thursday: 'thu',
  fri: 'fri', friday: 'fri',
  sat: 'sat', saturday: 'sat',
};

/**
 * Try to parse pin.hours into a structured 7-day array.
 *
 * Returns null when the input is null/empty. Otherwise returns a
 * ParsedHours where `structured` is the day array if at least 5 of 7
 * days came out clean, or null if the input is free-form prose.
 *
 * The "at least 5 days" threshold avoids false positives where a few
 * day names happen to appear in prose without being a real schedule.
 */
export function parseHours(raw: string | null | undefined): ParsedHours | null {
  if (!raw || !raw.trim()) return null;

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const byDay = new Map<DayKey, DayHours>();

  for (const line of lines) {
    // Match "Mon:" / "Monday –" / "Tue —" style prefixes followed by hours
    // or "Closed". Hour separator can be -, –, — depending on source.
    const m = line.match(/^(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thurs|thursday|fri|friday|sat|saturday)\b[\s:.\-–—]*(.+?)\s*$/i);
    if (!m) continue;
    const dayKey = DAY_NAME_TO_KEY[m[1].toLowerCase()];
    if (!dayKey) continue;
    const value = m[2].trim();

    // "Closed" — exact word, possibly followed by a comment.
    if (/^closed\b/i.test(value)) {
      byDay.set(dayKey, { day: dayKey, open: null, close: null, closed: true });
      continue;
    }

    // Time range: HH:MM–HH:MM (with various dashes), or 9 AM – 6 PM,
    // or 9–18, or 09:00 to 18:00. Normalise to HH:MM.
    const range = value.match(
      /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
    );
    if (range) {
      const open = formatTime(range[1], range[2], range[3]);
      const close = formatTime(range[4], range[5], range[6]);
      if (open && close) {
        byDay.set(dayKey, { day: dayKey, open, close, closed: false });
      }
    }
  }

  // 5-of-7 threshold to claim "this is structured".
  const dayCount = byDay.size;
  let structured: DayHours[] | null = null;
  if (dayCount >= 5) {
    structured = DAY_KEY.map(d => byDay.get(d)).filter((d): d is DayHours => !!d);
  }

  return { structured, prose: raw };
}

function formatTime(hourStr: string, minuteStr: string | undefined, ampm: string | undefined): string | null {
  let h = parseInt(hourStr, 10);
  if (Number.isNaN(h) || h < 0 || h > 24) return null;
  const m = minuteStr ? parseInt(minuteStr, 10) : 0;
  if (Number.isNaN(m) || m < 0 || m > 59) return null;
  if (ampm) {
    const lo = ampm.toLowerCase();
    if (lo === 'pm' && h < 12) h += 12;
    else if (lo === 'am' && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Get today's row from a parsed schedule. Uses local time for the
 * day-of-week lookup, which is what users expect for an "open today"
 * inline indicator. Returns null when input is null or prose.
 */
export function todayHours(parsed: ParsedHours | null, now: Date = new Date()): DayHours | null {
  if (!parsed?.structured) return null;
  const todayKey = DAY_KEY[now.getDay()];
  return parsed.structured.find(d => d.day === todayKey) ?? null;
}

/**
 * Render today's row as a compact one-liner suitable for a card:
 *   "Open today 10–18"
 *   "Closed today"
 * Returns null when no parseable schedule exists, so callers can
 * skip the line rather than showing "—".
 */
export function todayHoursLabel(parsed: ParsedHours | null, now: Date = new Date()): string | null {
  const today = todayHours(parsed, now);
  if (!today) return null;
  if (today.closed) return 'Closed today';
  if (!today.open || !today.close) return null;
  return `Open today ${formatHourShort(today.open)}–${formatHourShort(today.close)}`;
}

/** "10:00" → "10". "10:30" → "10:30". Drops :00 minutes for compactness. */
function formatHourShort(time: string): string {
  const [h, m] = time.split(':');
  if (m === '00') return h.replace(/^0/, '');
  return `${h.replace(/^0/, '')}:${m}`;
}

/** Capitalised display label for a day key. */
export const DAY_LABELS: Record<DayKey, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
};
