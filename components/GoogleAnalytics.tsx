import Script from 'next/script';

// === Google Analytics 4 ====================================================
// Uses next/script with strategy="beforeInteractive" — the only Next.js 15
// strategy that injects scripts into the framework's static <head> at
// server-render time. Earlier attempts (raw <script> inside a JSX <head>,
// next/script with afterInteractive) put the tags in <body> or in the
// React Server Components stream, which Google's tag detector can't see
// because it scrapes static HTML without executing JS.
//
// Trade-off: beforeInteractive runs before page hydration, which can
// theoretically delay first paint. For an async gtag.js snippet plus a
// tiny inline init this is invisible in practice — the network fetch is
// non-blocking and the inline script is microseconds of work.
//
// MUST be rendered inside the root layout (app/layout.tsx) — Next throws
// if a beforeInteractive Script is mounted from a leaf component.
//
// Consent Mode v2 stays intact: the inline init script defaults
// analytics_storage to 'denied'. CookieBanner dispatches a
// 'go-cookies-acked' window event on the OK click, and on every page
// load we read the localStorage flag the banner uses so returning
// visitors get their consent restored immediately. Both flips happen
// without a page reload.
//
// Env var NEXT_PUBLIC_GA_MEASUREMENT_ID overrides the hardcoded ID. The
// ID itself isn't a secret (it ships in every page's HTML), so a
// code-level default is fine.

const STORAGE_KEY = 'go-cookies-acked-v1';
const GRANT_EVENT = 'go-cookies-acked';

const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-V0ZWBL66ZK';

export default function GoogleAnalytics() {
  if (!GA_ID) return null;

  // Inline init script. Order matters: consent default MUST run before
  // the config call so the first pageview honours the deny state. Then
  // we restore consent for returning visitors and wire the event
  // listener for first-time consent grants. Both inline so they run
  // synchronously after gtag is defined.
  const init = `
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
    gtag('config', '${GA_ID}', { anonymize_ip: true, send_page_view: true });
    try {
      if (localStorage.getItem('${STORAGE_KEY}') === '1') {
        gtag('consent', 'update', { analytics_storage: 'granted' });
      }
    } catch (e) {}
    window.addEventListener('${GRANT_EVENT}', function() {
      gtag('consent', 'update', { analytics_storage: 'granted' });
    });
  `;

  return (
    <>
      <Script
        id="ga-lib"
        strategy="beforeInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script id="ga-init" strategy="beforeInteractive">
        {init}
      </Script>
    </>
  );
}
