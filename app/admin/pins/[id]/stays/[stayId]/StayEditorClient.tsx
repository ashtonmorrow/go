'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// === StayEditorClient ======================================================
// One form for both create and edit. State is the raw form (string-typed
// so empty inputs round-trip correctly), normalized to numbers / nulls
// at submit time.

export type StayEditorState = {
  id: string | null;
  pin_id: string;
  check_in: string;
  check_out: string;
  room_type: string;
  cash_amount: string;
  cash_currency: string;
  points_amount: string;
  points_program: string;
  cash_addon_amount: string;
  cash_addon_currency: string;
  booking_source: string;
  property_likes: string;
  breakfast_notes: string;
  bed_notes: string;
  bathroom_notes: string;
  amenities_notes: string;
  special_touches: string;
  location_notes: string;
  traveler_advice: string;
  personal_rating: string;
  would_stay_again: boolean | null;
  generated_review: string;
  generated_at: string | null;
  generated_by: string | null;
};

const POINTS_PROGRAMS = [
  { value: '', label: '— none —' },
  { value: 'ihg', label: 'IHG One Rewards' },
  { value: 'marriott', label: 'Marriott Bonvoy' },
  { value: 'hyatt', label: 'World of Hyatt' },
  { value: 'hilton', label: 'Hilton Honors' },
] as const;

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'THB'];

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn + 'T00:00:00Z').getTime();
  const b = new Date(checkOut + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : null;
}

export default function StayEditorClient({
  initial,
}: {
  initial: StayEditorState;
}) {
  const router = useRouter();
  const [s, setS] = useState<StayEditorState>(initial);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { error: string } | null>(null);

  const isNew = !s.id;
  const nights = useMemo(
    () => nightsBetween(s.check_in, s.check_out),
    [s.check_in, s.check_out],
  );

  function set<K extends keyof StayEditorState>(key: K, value: StayEditorState[K]) {
    setS(prev => ({ ...prev, [key]: value }));
  }

  function buildPayload(): Record<string, unknown> {
    return {
      pin_id: s.pin_id,
      check_in: s.check_in || null,
      check_out: s.check_out || null,
      room_type: s.room_type.trim() || null,
      cash_amount: toNum(s.cash_amount),
      cash_currency: s.cash_amount.trim() ? s.cash_currency : null,
      points_amount: toNum(s.points_amount),
      points_program: s.points_program || null,
      cash_addon_amount: toNum(s.cash_addon_amount),
      cash_addon_currency: s.cash_addon_amount.trim() ? s.cash_addon_currency : null,
      booking_source: s.booking_source.trim() || null,
      property_likes: s.property_likes.trim() || null,
      breakfast_notes: s.breakfast_notes.trim() || null,
      bed_notes: s.bed_notes.trim() || null,
      bathroom_notes: s.bathroom_notes.trim() || null,
      amenities_notes: s.amenities_notes.trim() || null,
      special_touches: s.special_touches.trim() || null,
      location_notes: s.location_notes.trim() || null,
      traveler_advice: s.traveler_advice.trim() || null,
      personal_rating: toNum(s.personal_rating),
      would_stay_again: s.would_stay_again,
      generated_review: s.generated_review.trim() || null,
    };
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setResult(null);
    try {
      const payload = buildPayload();
      let res: Response;
      if (isNew) {
        res = await fetch('/api/admin/hotel-stays', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/hotel-stays', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: s.id, ...payload }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `save failed (${res.status})`);
      setResult({ ok: true });
      if (isNew && data?.id) {
        router.replace(`/admin/pins/${s.pin_id}/stays/${data.id}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (generating) return;
    if (isNew) {
      // Generation needs a saved row so the server can read the
      // parent pin's name + city / country. Save first, then prompt
      // again.
      setResult({
        error: 'Save the stay first; the generator reads from the saved row.',
      });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/hotel-stays/generate-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: s.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `generate failed (${res.status})`);
      const text = (data?.review as string | undefined) ?? '';
      const model = (data?.model as string | undefined) ?? null;
      setS(prev => ({
        ...prev,
        generated_review: text,
        generated_at: new Date().toISOString(),
        generated_by: model,
      }));
      setResult({ ok: true });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'generate failed' });
    } finally {
      setGenerating(false);
    }
  }

  async function deleteStay() {
    if (deleting || isNew || !s.id) return;
    if (!confirm('Delete this stay? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/hotel-stays', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: s.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `delete failed (${res.status})`);
      router.replace(`/admin/pins/${s.pin_id}`);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'delete failed' });
      setDeleting(false);
    }
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
      className="space-y-8"
    >
      {result && 'ok' in result && (
        <div className="px-3 py-2 rounded bg-teal/10 text-teal text-small">Saved.</div>
      )}
      {result && 'error' in result && (
        <div className="px-3 py-2 rounded bg-orange/10 text-orange text-small">
          {result.error}
        </div>
      )}

      <Section label="Stay basics">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Check-in">
            <Input type="date" value={s.check_in} onChange={v => set('check_in', v)} />
          </Field>
          <Field label="Check-out">
            <Input type="date" value={s.check_out} onChange={v => set('check_out', v)} />
          </Field>
          <Field label="Nights">
            <div className="text-ink-deep text-small px-3 py-2">
              {nights ?? <span className="text-muted">—</span>}
              <span className="text-muted ml-1">(derived from dates)</span>
            </div>
          </Field>
          <Field label="Room type">
            <Input value={s.room_type} onChange={v => set('room_type', v)} />
          </Field>
          <Field label="Booking source">
            <Input
              value={s.booking_source}
              onChange={v => set('booking_source', v)}
              placeholder="booking.com / amex_travel / direct / ..."
            />
          </Field>
        </div>
      </Section>

      <Section label="Cash">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Total cash paid">
            <Input
              type="number"
              step="0.01"
              value={s.cash_amount}
              onChange={v => set('cash_amount', v)}
              placeholder="for the entire stay"
            />
          </Field>
          <Field label="Currency">
            <Select
              value={s.cash_currency}
              onChange={v => set('cash_currency', v)}
              options={CURRENCY_OPTIONS}
            />
          </Field>
        </div>
      </Section>

      <Section label="Points">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Total points used">
            <Input
              type="number"
              value={s.points_amount}
              onChange={v => set('points_amount', v)}
              placeholder="for the entire stay"
            />
          </Field>
          <Field label="Program">
            <select
              value={s.points_program}
              onChange={e => set('points_program', e.target.value)}
              className="px-3 py-2 rounded border border-sand bg-white text-small w-full"
            >
              {POINTS_PROGRAMS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
          <Field label="Cash add-on (resort fees, taxes)">
            <Input
              type="number"
              step="0.01"
              value={s.cash_addon_amount}
              onChange={v => set('cash_addon_amount', v)}
            />
          </Field>
          <Field label="Add-on currency">
            <Select
              value={s.cash_addon_currency}
              onChange={v => set('cash_addon_currency', v)}
              options={CURRENCY_OPTIONS}
            />
          </Field>
        </div>
      </Section>

      <Section label="Rating">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Personal rating (1–5)">
            <Input
              type="number"
              min="1"
              max="5"
              value={s.personal_rating}
              onChange={v => set('personal_rating', v)}
            />
          </Field>
          <Field label="Would stay again">
            <select
              value={s.would_stay_again == null ? '' : s.would_stay_again ? 'yes' : 'no'}
              onChange={e =>
                set(
                  'would_stay_again',
                  e.target.value === '' ? null : e.target.value === 'yes',
                )
              }
              className="px-3 py-2 rounded border border-sand bg-white text-small w-full"
            >
              <option value="">— unspecified —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section label="Notes for the review">
        <p className="text-small text-muted -mt-2 mb-4">
          Skip any prompt that doesn&rsquo;t apply. The generator leaves
          empty topics out of the final review rather than padding them.
        </p>
        <Textarea
          label="What did you like about the property?"
          value={s.property_likes}
          onChange={v => set('property_likes', v)}
        />
        <Textarea
          label="How was breakfast?"
          value={s.breakfast_notes}
          onChange={v => set('breakfast_notes', v)}
        />
        <Textarea
          label="How was the bed?"
          value={s.bed_notes}
          onChange={v => set('bed_notes', v)}
        />
        <Textarea
          label="How was the bathroom?"
          value={s.bathroom_notes}
          onChange={v => set('bathroom_notes', v)}
        />
        <Textarea
          label="How were the amenities?"
          value={s.amenities_notes}
          onChange={v => set('amenities_notes', v)}
        />
        <Textarea
          label="Did they do anything special or different?"
          value={s.special_touches}
          onChange={v => set('special_touches', v)}
        />
        <Textarea
          label="How was the location?"
          value={s.location_notes}
          onChange={v => set('location_notes', v)}
        />
        <Textarea
          label="Anything a traveler might want to know before booking?"
          value={s.traveler_advice}
          onChange={v => set('traveler_advice', v)}
        />
      </Section>

      <Section label="Generated review">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="text-small text-muted">
            {s.generated_at ? (
              <>
                Last generated{' '}
                {new Date(s.generated_at).toLocaleString()}
                {s.generated_by ? ` · ${s.generated_by}` : ''}
              </>
            ) : (
              'Not generated yet.'
            )}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="text-small px-3 py-1.5 rounded border border-teal text-teal hover:bg-teal/10 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate from notes'}
          </button>
        </div>
        <textarea
          value={s.generated_review}
          onChange={e => set('generated_review', e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded border border-sand bg-white text-small leading-relaxed font-sans"
          placeholder="Generated review will appear here. Edit freely before saving."
        />
      </Section>

      <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-sand">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded bg-teal text-white font-medium text-small hover:bg-teal/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isNew ? 'Create stay' : 'Save changes'}
        </button>
        {!isNew && (
          <button
            type="button"
            onClick={deleteStay}
            disabled={deleting}
            className="px-4 py-2 rounded border border-red-500/40 text-red-600 text-small hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete stay'}
          </button>
        )}
      </div>
    </form>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-h3 text-ink-deep mb-3">{label}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-label uppercase tracking-wider text-muted mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type,
  placeholder,
  step,
  min,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      className="w-full px-3 py-2 rounded border border-sand bg-white text-small"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded border border-sand bg-white text-small"
    >
      {options.map(o => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-label uppercase tracking-wider text-muted mb-1.5">
        {label}
      </span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 rounded border border-sand bg-white text-small leading-relaxed"
      />
    </label>
  );
}
