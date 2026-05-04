'use client';

import Script from 'next/script';
import { useEffect } from 'react';

// === Google Analytics 4 ====================================================
// gtag.js loaded the Next-native way via <Script strategy="afterInteractive">
// instead of a raw <script> tag in <head>. That defers the network fetch
// past hydration so it doesn't block first paint, and Next handles
// cleanup if the user navigates client-side before the script lands.
//
// Wired into Google Consent Mode v2: analytics_storage starts as 'denied'
// so no cookies/identifiers are written until the user acks the cookie
// banner. The banner dispatches a `go-cookies-acked` window event on the
// OK click, and on page load we read the localStorage flag the banner
// uses (`go-cookies-acked-v1`) so returning visitors get their consent
// restored immediately. Result: full GA tracking after consent, fully
// silent before, all without a page reload.
//
// Env var NEXT_PUBLIC_GA_MEASUREMENT_ID overrides the hardcoded ID at
// the bottom — useful for staging or for people forking the repo. The
// ID itself isn't a secret (it's emitted in every page's HTML), so a
// code-level default is fine.

const STORAGE_KEY = 'go-cookies-acked-v1';
const GRANT_EVENT = 'go-cookies-acked';

const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-V0ZWBL66ZK';

export default function GoogleAnalytics() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Returning visitor who already consented — flip storage on as soon
    // as gtag is reachable. The Script's afterInteractive strategy means
    // gtag may not exist yet at this useEffect tick, so we poll briefly.
    const grantIfAcked = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== '1') return;
      } catch {
        return;
      }
      const w = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof w.gtag === 'function') {
        w.gtag('consent', 'update', { analytics_storage: 'granted' });
      } else {
        // gtag not loaded yet — try again on next animation frame.
        requestAnimationFrame(grantIfAcked);
      }
    };
    grantIfAcked();

    // First-time visitor flips consent the moment they click OK on the
    // banner. CookieBanner dispatches this same event so we don't need
    // a page reload to start collecting analytics.
    const onGrant = () => {
      const w = window as unknown as { gtag?: (...args: unknown[]) => void };
      w.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    };
    window.addEventListener(GRANT_EVENT, onGrant);
    return () => window.removeEventListener(GRANT_EVENT, onGrant);
  }, []);

  if (!GA_ID) return null;

  return (
    <>
      {/* Library load — Next defers this past hydration via the strategy. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      {/* gtag setup. Consent Mode v2 default-deny is set BEFORE the
          config call so the first pageview honors the deny state.
          gtag('config', ...) will queue the event and replay it once
          consent flips to granted. */}
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });
          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            anonymize_ip: true,
            send_page_view: true
          });
        `}
      </Script>
    </>
  );
}
