'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';

type FileStatus =
  | { stage: 'pending' }
  | { stage: 'parsing' }
  | { stage: 'done'; pinId: string; pinSlug: string | null; name: string; isNew: boolean; duplicate: boolean }
  | { stage: 'error'; error: string };

type Item = {
  id: string;
  file: File;
  status: FileStatus;
};

export default function ReservationParserClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteResult, setPasteResult] = useState<{ pinId: string; pinSlug: string | null; name: string; duplicate: boolean } | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = (files: File[]) => {
    const fresh = files
      .filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        status: { stage: 'pending' as const },
      }));
    setItems(prev => [...prev, ...fresh]);
    // Kick off processing for each new item sequentially so we don't slam
    // Gemini and so the user sees progress flow top-to-bottom.
    void processQueue(fresh);
  };

  const processQueue = async (queue: Item[]) => {
    for (const it of queue) {
      setItems(prev => prev.map(p => (p.id === it.id ? { ...p, status: { stage: 'parsing' } } : p)));
      try {
        const form = new FormData();
        form.append('file', it.file, it.file.name);
        const res = await fetch('/api/admin/parse-reservation', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? `parse failed (${res.status})`);
        }
        setItems(prev =>
          prev.map(p =>
            p.id === it.id
              ? {
                  ...p,
                  status: {
                    stage: 'done',
                    pinId: data.id,
                    pinSlug: data.slug ?? null,
                    name: data.name,
                    isNew: !!data.isNew,
                    duplicate: !!data.duplicate,
                  },
                }
              : p,
          ),
        );
      } catch (e) {
        setItems(prev =>
          prev.map(p =>
            p.id === it.id
              ? { ...p, status: { stage: 'error', error: e instanceof Error ? e.message : 'failed' } }
              : p,
          ),
        );
      }
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    ingest(Array.from(e.dataTransfer.files));
  };

  const submitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPasting(true);
    setPasteError(null);
    setPasteResult(null);
    try {
      const res = await fetch('/api/admin/parse-reservation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `parse failed (${res.status})`);
      setPasteResult({
        pinId: data.id,
        pinSlug: data.slug ?? null,
        name: data.name,
        duplicate: !!data.duplicate,
      });
      setText('');
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setPasting(false);
    }
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(p => p.id !== id));
  };

  const clearAll = () => {
    setItems([]);
    setPasteResult(null);
    setPasteError(null);
  };

  const doneItems = items.filter(it => it.status.stage === 'done');
  const errorItems = items.filter(it => it.status.stage === 'error');
  const inFlightItems = items.filter(it => it.status.stage === 'parsing' || it.status.stage === 'pending');

  return (
    <div className="space-y-6">
      <DropZone onDrop={onDrop} onPick={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) ingest(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      {items.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-h3 text-ink-deep">Uploads</h2>
            <div className="text-label text-muted">
              {doneItems.length} parsed
              {inFlightItems.length > 0 && <> · {inFlightItems.length} in flight</>}
              {errorItems.length > 0 && <> · {errorItems.length} failed</>}
              <button
                type="button"
                onClick={clearAll}
                className="ml-3 text-ink hover:text-orange"
              >
                Clear list
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {items.map(it => (
              <PdfRow key={it.id} item={it} onRemove={() => removeItem(it.id)} />
            ))}
          </ul>
        </section>
      )}

      <details className="border-t border-sand pt-6">
        <summary className="text-small text-muted cursor-pointer select-none mb-3">
          Or paste an email body instead
        </summary>
        <form onSubmit={submitText} className="space-y-3">
          {pasteError && (
            <div className="px-3 py-2 rounded bg-orange/10 text-orange text-small">
              {pasteError}
            </div>
          )}
          {pasteResult && (
            <div className={'px-3 py-2 rounded text-small ' + (pasteResult.duplicate ? 'bg-cream-soft text-slate' : 'bg-teal/10 text-teal')}>
              {pasteResult.duplicate
                ? <>Already imported <strong>{pasteResult.name}</strong> — skipped.</>
                : <>Created <strong>{pasteResult.name}</strong></>}
              {' · '}
              <Link href={`/admin/pins/${pasteResult.pinId}`} className="underline">
                edit
              </Link>
            </div>
          )}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste the full body of the confirmation email…"
            rows={10}
            className="w-full text-small font-mono border border-sand rounded px-3 py-2 bg-white leading-relaxed resize-y"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-label text-muted">
              Names, dates, and confirmation numbers are stripped before save.
            </p>
            <button
              type="submit"
              disabled={!text.trim() || pasting}
              className={
                'px-4 py-2 text-small rounded font-medium ' +
                (!text.trim() || pasting
                  ? 'bg-cream-soft text-muted cursor-not-allowed'
                  : 'bg-teal text-white hover:bg-teal/90')
              }
            >
              {pasting ? 'Parsing…' : 'Parse text'}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function DropZone({
  onDrop,
  onPick,
}: {
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={e => {
        setHover(false);
        onDrop(e);
      }}
      className={
        'border-2 border-dashed rounded-lg p-10 text-center transition-colors ' +
        (hover ? 'border-teal bg-teal/5' : 'border-sand bg-cream-soft')
      }
    >
      <p className="text-ink-deep font-medium mb-1">Drop hotel confirmation PDFs</p>
      <p className="text-small text-muted mb-4">
        One pin per PDF. Up to 4 MB each. Names, dates, and confirmation numbers
        are stripped before save.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="px-4 py-2 text-small font-medium rounded bg-ink-deep text-white"
      >
        Choose PDFs
      </button>
    </div>
  );
}

function PdfRow({ item, onRemove }: { item: Item; onRemove: () => void }) {
  const { file, status } = item;
  return (
    <li className="flex items-center gap-3 p-3 rounded border border-sand bg-white text-small">
      <div className="text-label uppercase tracking-wider text-muted w-12 flex-shrink-0">PDF</div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-small text-ink-deep truncate">{file.name}</p>
        <p className="text-label text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        {status.stage === 'parsing' && (
          <p className="text-label text-muted">Parsing with Gemini…</p>
        )}
        {status.stage === 'pending' && (
          <p className="text-label text-muted">Queued.</p>
        )}
        {status.stage === 'error' && (
          <p className="text-label text-orange">{status.error}</p>
        )}
        {status.stage === 'done' && (
          <p className={'text-label ' + (status.duplicate ? 'text-slate' : 'text-teal')}>
            {status.duplicate
              ? <>Already imported <strong>{status.name}</strong> — skipped.</>
              : <>{status.isNew ? 'Created' : 'Updated'} <strong>{status.name}</strong></>}
          </p>
        )}
      </div>
      {status.stage === 'done' && (
        <Link
          href={`/admin/pins/${status.pinId}`}
          className="text-label px-3 py-1.5 rounded bg-teal text-white hover:bg-teal/90"
        >
          Edit pin
        </Link>
      )}
      {(status.stage === 'pending' || status.stage === 'error') && (
        <button
          type="button"
          onClick={onRemove}
          className="text-label px-2 py-1 text-muted hover:text-orange"
          aria-label="Remove"
        >
          ✕
        </button>
      )}
    </li>
  );
}
