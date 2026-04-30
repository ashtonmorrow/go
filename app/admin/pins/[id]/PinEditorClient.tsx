'use client';

import { useMemo, useState } from 'react';
import type { PinEditorState } from './editorData';

const KINDS = ['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit'] as const;

export default function PinEditorClient({ initial }: { initial: PinEditorState }) {
  const [state, setState] = useState<PinEditorState>(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { error: string } | null>(null);

  const dirty = useMemo(() => {
    const keys = Object.keys(state) as (keyof PinEditorState)[];
    for (const k of keys) {
      const a = state[k];
      const b = initial[k];
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) return true;
      } else if (a !== b) {
        return true;
      }
    }
    return false;
  }, [state, initial]);

  const set = <K extends keyof PinEditorState>(key: K, value: PinEditorState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      // Build a diff: only fields that changed
      const fields: Record<string, unknown> = {};
      const keys = Object.keys(state) as (keyof PinEditorState)[];
      for (const k of keys) {
        if (k === 'id') continue;
        const a = state[k];
        const b = initial[k];
        if (Array.isArray(a) && Array.isArray(b)) {
          if (a.length !== b.length || a.some((v, i) => v !== b[i])) fields[k] = a;
        } else if (a !== b) {
          fields[k] = a;
        }
      }
      const res = await fetch('/api/admin/update-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: state.id, fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `save failed (${res.status})`);
      setResult({ ok: true });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); save(); }}
      className="space-y-8"
    >
      {result && 'ok' in result && (
        <div className="px-3 py-2 rounded bg-teal/10 text-teal text-small">Saved.</div>
      )}
      {result && 'error' in result && (
        <div className="px-3 py-2 rounded bg-orange/10 text-orange text-small">{result.error}</div>
      )}

      <Section label="Identity">
        <Field label="Name">
          <Input value={state.name} onChange={v => set('name', v)} />
        </Field>
        <Field label="Slug">
          <Input value={state.slug ?? ''} onChange={v => set('slug', v || null)} mono />
        </Field>
        <Field label="Kind">
          <select
            value={state.kind ?? ''}
            onChange={e => set('kind', (e.target.value || null) as any)}
            className={inputCls}
          >
            <option value="">(unset)</option>
            {KINDS.map(k => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category (raw)">
          <Input value={state.category ?? ''} onChange={v => set('category', v || null)} />
        </Field>
      </Section>

      <Section label="Status">
        <Field label="Visited">
          <BoolToggle value={state.visited} onChange={v => set('visited', !!v)} />
        </Field>
        <Field label="Status">
          <select
            value={state.status ?? ''}
            onChange={e => set('status', (e.target.value || null))}
            className={inputCls}
          >
            <option value="">(unset)</option>
            <option value="active">Open</option>
            <option value="closed">Permanently closed</option>
            <option value="temporarily-closed">Temporarily closed</option>
            <option value="seasonal">Seasonal</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        <Field label="Closure reason">
          <Input value={state.closure_reason ?? ''} onChange={v => set('closure_reason', v || null)} />
        </Field>
      </Section>

      <Section label="Your visit">
        <Field label="Rating (1-5)">
          <input
            type="number"
            min={1}
            max={5}
            value={state.personal_rating ?? ''}
            onChange={e => set('personal_rating', e.target.value ? Number(e.target.value) : null)}
            className={inputCls + ' w-24'}
          />
        </Field>
        <Field label="Visit dates">
          <Input
            value={state.visit_dates ?? ''}
            onChange={v => set('visit_dates', v || null)}
            placeholder="March 2024 / 2024-03-15 to 19"
          />
        </Field>
        <Field label="Companions">
          <ArrayInput
            value={state.companions}
            onChange={v => set('companions', v)}
            placeholder="solo, family, friends, partner"
          />
        </Field>
        <Field label="Public review">
          <Textarea
            value={state.personal_review ?? ''}
            onChange={v => set('personal_review', v || null)}
            placeholder="What you'd tell a friend"
          />
        </Field>
        <Field label="Private notes">
          <Textarea
            value={state.personal_notes ?? ''}
            onChange={v => set('personal_notes', v || null)}
            placeholder="Admin-only — not shown publicly"
          />
        </Field>
      </Section>

      {state.kind === 'hotel' && (
        <Section label="Your stay">
          <Field label="Nights stayed">
            <input
              type="number"
              value={state.nights_stayed ?? ''}
              onChange={e => set('nights_stayed', e.target.value ? Number(e.target.value) : null)}
              className={inputCls + ' w-24'}
            />
          </Field>
          <Field label="Room type">
            <Input
              value={state.room_type ?? ''}
              onChange={v => set('room_type', v || null)}
              placeholder="Standard double / Hostel dorm / Suite"
            />
          </Field>
          <Field label="Price per night">
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={state.room_price_per_night ?? ''}
                onChange={e => set('room_price_per_night', e.target.value ? Number(e.target.value) : null)}
                className={inputCls + ' w-32'}
              />
              <Input
                value={state.room_price_currency ?? ''}
                onChange={v => set('room_price_currency', v || null)}
                placeholder="USD"
                mono
                className="w-20"
              />
            </div>
          </Field>
          <Field label="Would stay again">
            <BoolTri value={state.would_stay_again} onChange={v => set('would_stay_again', v)} />
          </Field>
        </Section>
      )}

      {state.kind === 'restaurant' && (
        <Section label="Your meal">
          <Field label="Cuisine">
            <ArrayInput
              value={state.cuisine}
              onChange={v => set('cuisine', v)}
              placeholder="italian, japanese, fusion"
            />
          </Field>
          <Field label="Meal types">
            <ArrayInput
              value={state.meal_types}
              onChange={v => set('meal_types', v)}
              placeholder="breakfast, lunch, dinner, drinks, dessert"
            />
          </Field>
          <Field label="Dishes tried">
            <ArrayInput
              value={state.dishes_tried}
              onChange={v => set('dishes_tried', v)}
              placeholder="cacio e pepe, tiramisu"
            />
          </Field>
          <Field label="Dietary options">
            <ArrayInput
              value={state.dietary_options}
              onChange={v => set('dietary_options', v)}
              placeholder="vegetarian, vegan, gluten-free, halal, kosher"
            />
          </Field>
          <Field label="Reservation recommended">
            <BoolTri value={state.reservation_recommended} onChange={v => set('reservation_recommended', v)} />
          </Field>
        </Section>
      )}

      <Section label="Location">
        <Field label="Address">
          <Input value={state.address ?? ''} onChange={v => set('address', v || null)} />
        </Field>
        <Field label="Lat">
          <input
            type="number"
            step="any"
            value={state.lat ?? ''}
            onChange={e => set('lat', e.target.value ? Number(e.target.value) : null)}
            className={inputCls + ' font-mono'}
          />
        </Field>
        <Field label="Lng">
          <input
            type="number"
            step="any"
            value={state.lng ?? ''}
            onChange={e => set('lng', e.target.value ? Number(e.target.value) : null)}
            className={inputCls + ' font-mono'}
          />
        </Field>
        <Field label="Cities">
          <ArrayInput value={state.city_names} onChange={v => set('city_names', v)} />
        </Field>
        <Field label="Country">
          <ArrayInput value={state.states_names} onChange={v => set('states_names', v)} />
        </Field>
      </Section>

      <Section label="Description & links">
        <Field label="Description">
          <Textarea
            value={state.description ?? ''}
            onChange={v => set('description', v || null)}
          />
        </Field>
        <Field label="Website">
          <Input value={state.website ?? ''} onChange={v => set('website', v || null)} />
        </Field>
      </Section>

      <Section label="Cost (legacy)">
        <Field label="Free admission">
          <BoolTri value={state.free} onChange={v => set('free', v)} />
        </Field>
        <Field label="Price text">
          <Input value={state.price_text ?? ''} onChange={v => set('price_text', v || null)} />
        </Field>
        <Field label="Price amount">
          <input
            type="number"
            step="0.01"
            value={state.price_amount ?? ''}
            onChange={e => set('price_amount', e.target.value ? Number(e.target.value) : null)}
            className={inputCls + ' w-32'}
          />
        </Field>
        <Field label="Currency">
          <Input
            value={state.price_currency ?? ''}
            onChange={v => set('price_currency', v || null)}
            placeholder="USD"
            mono
            className="w-20"
          />
        </Field>
      </Section>

      <Section label="Hours (free text)">
        <Textarea
          value={state.hours ?? ''}
          onChange={v => set('hours', v || null)}
          placeholder="Mon-Fri 09:00-17:00"
        />
      </Section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 bg-white p-3 rounded shadow-paper border border-sand">
        <span className="text-small text-muted">
          {dirty ? 'Unsaved changes' : 'No changes'}
        </span>
        <button
          type="submit"
          disabled={!dirty || saving}
          className={
            'px-4 py-2 text-small rounded font-medium transition-colors ' +
            (!dirty || saving
              ? 'bg-cream-soft text-muted cursor-not-allowed'
              : 'bg-teal text-white hover:bg-teal/90')
          }
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

const inputCls = 'border border-sand rounded px-2 py-1.5 bg-white text-small';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-h3 text-ink-deep mb-3 border-b border-sand pb-2">{label}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start gap-3">
      <label className="text-small text-slate pt-1.5">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls + ' w-full ' + (mono ? 'font-mono ' : '') + (className ?? '')}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className={inputCls + ' w-full font-sans leading-relaxed resize-y'}
    />
  );
}

function ArrayInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      type="text"
      value={text}
      onChange={e => {
        setText(e.target.value);
        const arr = e.target.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        onChange(arr);
      }}
      placeholder={placeholder}
      className={inputCls + ' w-full'}
    />
  );
}

function BoolToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={
        'px-3 py-1.5 text-small rounded border transition-colors ' +
        (value
          ? 'bg-teal text-white border-teal'
          : 'bg-white text-ink border-sand hover:bg-cream-soft')
      }
      aria-pressed={value}
    >
      {value ? 'Yes' : 'No'}
    </button>
  );
}

function BoolTri({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="inline-flex rounded border border-sand overflow-hidden text-[11px]">
      {([
        ['Unset', null],
        ['Yes', true],
        ['No', false],
      ] as const).map(([label, v]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(v)}
          className={
            'px-3 py-1.5 ' +
            (value === v
              ? 'bg-ink-deep text-white'
              : 'bg-white text-ink hover:bg-cream-soft')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
