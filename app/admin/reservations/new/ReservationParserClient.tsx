'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReservationParserClient() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/parse-reservation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `parse failed (${res.status})`);
      }
      if (data?.id) {
        router.push(`/admin/pins/${data.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setParsing(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="px-3 py-2 rounded bg-orange/10 text-orange text-small">
          {error}
        </div>
      )}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste the full body of the confirmation email…"
        rows={20}
        className="w-full text-small font-mono border border-sand rounded px-3 py-2 bg-white leading-relaxed resize-y"
        autoFocus
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted">
          Names, dates, and confirmation numbers are stripped before save.
        </p>
        <button
          type="submit"
          disabled={!text.trim() || parsing}
          className={
            'px-4 py-2 text-small rounded font-medium ' +
            (!text.trim() || parsing
              ? 'bg-cream-soft text-muted cursor-not-allowed'
              : 'bg-teal text-white hover:bg-teal/90')
          }
        >
          {parsing ? 'Parsing…' : 'Parse and create pin'}
        </button>
      </div>
    </form>
  );
}
