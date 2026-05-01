'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'go-cookies-acked-v1';

export default function CookieBanner() {
  // Mounted flag avoids the SSR/CSR mismatch — we only read localStorage
  // after hydration, so the banner appears only on the client and never
  // flashes during SSR.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* localStorage blocked — treat as not dismissed but don't crash */
      setDismissed(false);
    }
  }, []);

  if (!mounted || dismissed) return null;

  const acknowledge = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-50
                 rounded-lg shadow-paper border border-sand bg-white px-3 py-2.5
                 flex items-center gap-3 text-small text-ink leading-snug"
    >
      <p className="flex-1">
        This is a personal travel project. I use a bit of analytics to know what people
        read. <Link href="/privacy" className="text-teal hover:underline">More.</Link>
      </p>
      <button
        type="button"
        onClick={acknowledge}
        className="px-2.5 py-1 rounded bg-ink-deep text-white text-label font-medium hover:bg-ink-deep/90"
      >
        OK
      </button>
    </div>
  );
}
