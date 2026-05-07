'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// === EnrichDescriptionsClient ==============================================
// Per-row generate + edit + save workflow for pins with thin descriptions.
//
// State per row is one of:
//   idle          → no draft yet, Generate button available
//   generating    → Gemini call in flight
//   draft         → text returned (or admin edited it), Save button enabled
//   saving        → write to /api/admin/update-pin in flight
//   saved         → committed, row dims to indicate done; Generate again
//                   if you want a different version
//   error         → Generate or Save failed
//
// Generation is sequential by default — kicking off a "Generate next 5"
// run paces requests through the queue without slamming Gemini. Per-row
// Generate buttons stay available for ad-hoc work.

export type ThinPinRow = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  kind: string | null;
  visited: boolean;
  unescoId: number | null;
  unescoUrl: string | null;
  wikipediaUrl: string | null;
  atlasObscuraSlug: string | null;
  curatedLists: string[];
  savedLists: string[];
  description: string | null;
  descriptionLength: number;
  rankBucket: number;
};

type RowStatus =
  | { stage: 'idle' }
  | { stage: 'generating' }
  | { stage: 'draft'; text: string; model: string | null }
  | { stage: 'saving'; text: string }
  | { stage: 'saved'; text: string }
  | { stage: 'error'; message: string };

const RANK_LABEL_LOOKUP_DEFAULT: Record<number, string> = {
  1: 'Visited + curated',
  2: 'Visited + saved',
  3: 'Visited',
  4: 'UNESCO',
  5: 'Curated',
  6: 'Saved',
  7: 'Other',
};

export default function EnrichDescriptionsClient({
  initialRows,
  rankLabels = RANK_LABEL_LOOKUP_DEFAULT,
}: {
  initialRows: ThinPinRow[];
  rankLabels?: Record<number, string>;
}) {
  const [rows] = useState(initialRows);
  const [statuses, setStatuses] = useState<Map<string, RowStatus>>(
    () => new Map(initialRows.map(r => [r.id, { stage: 'idle' as const }])),
  );
  const [q, setQ] = useState('');
  const [bucketFilter, setBucketFilter] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchAbort, setBatchAbort] = useState<{ aborted: boolean }>({ aborted: false });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (bucketFilter != null && r.rankBucket !== bucketFilter) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.city ?? '').toLowerCase().includes(needle) ||
        (r.country ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, bucketFilter]);

  function setStatus(id: string, status: RowStatus) {
    setStatuses(prev => {
      const next = new Map(prev);
      next.set(id, status);
      return next;
    });
  }

  function setText(id: string, text: string) {
    setStatuses(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur && cur.stage === 'draft') {
        next.set(id, { ...cur, text });
      } else if (cur && cur.stage === 'saved') {
        // Editing a saved row demotes it back to draft so the Save
        // button reappears. Preserve no model since we no longer have
        // it after save commit.
        next.set(id, { stage: 'draft', text, model: null });
      }
      return next;
    });
  }

  async function generate(id: string): Promise<boolean> {
    setStatus(id, { stage: 'generating' });
    try {
      const res = await fetch('/api/admin/pins/generate-description', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `failed (${res.status})`);
      const text = typeof data.description === 'string' ? data.description : '';
      if (!text) throw new Error('empty result');
      setStatus(id, {
        stage: 'draft',
        text,
        model: typeof data.model === 'string' ? data.model : null,
      });
      return true;
    } catch (e) {
      setStatus(id, {
        stage: 'error',
        message: e instanceof Error ? e.message : 'generation failed',
      });
      return false;
    }
  }

  async function save(id: string) {
    const cur = statuses.get(id);
    if (!cur || (cur.stage !== 'draft' && cur.stage !== 'saved')) return;
    const text = cur.text.trim();
    if (!text) {
      setStatus(id, { stage: 'error', message: 'empty description' });
      return;
    }
    setStatus(id, { stage: 'saving', text });
    try {
      const res = await fetch('/api/admin/update-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, fields: { description: text } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `save failed (${res.status})`);
      setStatus(id, { stage: 'saved', text });
    } catch (e) {
      setStatus(id, {
        stage: 'error',
        message: e instanceof Error ? e.message : 'save failed',
      });
    }
  }

  async function runBatch(count: number) {
    if (batchRunning) return;
    setBatchRunning(true);
    setBatchAbort({ aborted: false });
    const abort = batchAbort;
    // Pick the first N rows in the current filter that are in 'idle' or
    // 'error' stage. Skip ones already drafted or saved so a re-run
    // doesn't overwrite work in progress.
    const targets = filtered
      .filter(r => {
        const s = statuses.get(r.id);
        return !s || s.stage === 'idle' || s.stage === 'error';
      })
      .slice(0, count);
    for (const r of targets) {
      if (abort.aborted) break;
      const ok = await generate(r.id);
      // Small spacing between calls so a chain of failures doesn't
      // hammer the edge function. 500ms is plenty given the model
      // call itself takes longer than that.
      if (ok) await new Promise(res => setTimeout(res, 500));
    }
    setBatchRunning(false);
  }

  function abortBatch() {
    setBatchAbort(prev => ({ ...prev, aborted: true }));
    setBatchRunning(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, city, country"
            className="text-small border border-sand rounded px-3 py-2 bg-white w-64"
          />
          <select
            value={bucketFilter ?? ''}
            onChange={e => setBucketFilter(e.target.value ? Number(e.target.value) : null)}
            className="text-small border border-sand rounded px-2 py-2 bg-white"
            title="Filter by rank bucket"
          >
            <option value="">All buckets</option>
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <option key={n} value={n}>{n}. {rankLabels[n]}</option>
            ))}
          </select>
          <span className="text-label text-muted">
            {filtered.length} shown · {rows.length} thin
          </span>
        </div>
        <div className="flex items-center gap-2">
          {batchRunning ? (
            <button
              type="button"
              onClick={abortBatch}
              className="text-small px-3 py-2 rounded border border-orange/40 bg-orange/10 text-orange hover:bg-orange/15"
            >
              Stop batch
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => runBatch(5)}
                className="text-small px-3 py-2 rounded border border-sand text-ink hover:bg-cream-soft"
                title="Run Generate on the next 5 idle rows in the current filter"
              >
                Generate next 5
              </button>
              <button
                type="button"
                onClick={() => runBatch(20)}
                className="text-small px-3 py-2 rounded border border-sand text-ink hover:bg-cream-soft"
                title="Run Generate on the next 20 idle rows in the current filter"
              >
                Next 20
              </button>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-3">
        {filtered.length === 0 && (
          <li className="text-small text-muted text-center py-12">
            Nothing to enrich here. Try a different bucket or search.
          </li>
        )}
        {filtered.map(row => {
          const status = statuses.get(row.id) ?? { stage: 'idle' as const };
          return (
            <li
              key={row.id}
              className={
                'border border-sand rounded p-3 ' +
                (status.stage === 'saved'
                  ? 'bg-teal/5'
                  : status.stage === 'error'
                  ? 'bg-orange/5'
                  : 'bg-white')
              }
            >
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/pins/${row.id}`}
                      className="text-ink-deep font-medium hover:text-teal"
                    >
                      {row.name}
                    </Link>
                    {row.slug && (
                      <Link
                        href={`/pins/${row.slug}`}
                        target="_blank"
                        className="text-micro text-muted hover:text-teal"
                      >
                        view ↗
                      </Link>
                    )}
                    <span className="pill text-micro bg-cream-soft text-slate">
                      {rankLabels[row.rankBucket] ?? `bucket ${row.rankBucket}`}
                    </span>
                    {row.kind && (
                      <span className="pill text-micro bg-cream-soft text-slate capitalize">
                        {row.kind}
                      </span>
                    )}
                    {row.visited && (
                      <span className="pill text-micro bg-teal/10 text-teal">Been</span>
                    )}
                    {row.unescoId != null && (
                      <span className="pill text-micro bg-amber-50 text-amber-800">UNESCO</span>
                    )}
                  </div>
                  <p className="mt-1 text-label text-muted">
                    {[row.city, row.country].filter(Boolean).join(' · ') || '—'}
                    {row.curatedLists.length > 0 && (
                      <> · curated: {row.curatedLists.slice(0, 3).join(', ')}{row.curatedLists.length > 3 ? '…' : ''}</>
                    )}
                  </p>
                  <div className="mt-1 text-label text-slate flex flex-wrap gap-3">
                    {row.wikipediaUrl && (
                      <a
                        href={row.wikipediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        Wikipedia ↗
                      </a>
                    )}
                    {row.atlasObscuraSlug && (
                      <a
                        href={`https://www.atlasobscura.com/places/${row.atlasObscuraSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        Atlas Obscura ↗
                      </a>
                    )}
                    {row.unescoUrl && (
                      <a
                        href={row.unescoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        UNESCO ↗
                      </a>
                    )}
                  </div>
                  {row.description && (
                    <p className="mt-2 text-label text-muted italic line-clamp-2">
                      Current ({row.descriptionLength} ch): {row.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => generate(row.id)}
                    disabled={status.stage === 'generating' || status.stage === 'saving' || batchRunning}
                    className={
                      'text-small px-3 py-1.5 rounded font-medium ' +
                      (status.stage === 'generating' || status.stage === 'saving' || batchRunning
                        ? 'bg-cream-soft text-muted cursor-not-allowed'
                        : 'bg-teal text-white hover:bg-teal/90')
                    }
                  >
                    {status.stage === 'generating'
                      ? 'Generating…'
                      : status.stage === 'draft' || status.stage === 'saved'
                      ? 'Regenerate'
                      : 'Generate'}
                  </button>
                  {(status.stage === 'draft' || status.stage === 'error') && (
                    <button
                      type="button"
                      onClick={() => save(row.id)}
                      disabled={status.stage !== 'draft'}
                      className={
                        'text-small px-3 py-1.5 rounded font-medium ' +
                        (status.stage === 'draft'
                          ? 'border border-teal text-teal hover:bg-teal/10'
                          : 'bg-cream-soft text-muted cursor-not-allowed')
                      }
                    >
                      Save
                    </button>
                  )}
                  {status.stage === 'saving' && (
                    <span className="text-label text-muted">Saving…</span>
                  )}
                  {status.stage === 'saved' && (
                    <span className="text-label text-teal">Saved ✓</span>
                  )}
                </div>
              </div>

              {(status.stage === 'draft' || status.stage === 'saving' || status.stage === 'saved') && (
                <textarea
                  value={status.stage === 'saving' ? status.text : status.text}
                  onChange={e => setText(row.id, e.target.value)}
                  rows={4}
                  disabled={status.stage === 'saving'}
                  className="w-full text-small border border-sand rounded px-2 py-2 bg-white leading-relaxed resize-y"
                />
              )}
              {status.stage === 'draft' && (
                <p className="mt-1 text-label text-muted">
                  {status.text.trim().length} chars · {status.model ?? 'gemini'}
                </p>
              )}
              {status.stage === 'error' && (
                <p className="mt-2 text-label text-orange">
                  {status.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
