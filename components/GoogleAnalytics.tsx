import Script from 'next/script';

// === Google Analytics 4 ====================================================
// Two scripts working together:
//
//  1. Inline init (strategy="beforeInteractive") — defines window.gtag,
//     sets the Consent Mode v2 default to denied, queues the first
//     `config` call, and restores prior consent for returning visitors.
//     Stays beforeInteractive so the consent default is set before any
//     other code runs and the first pageview honours the deny state.
//
//  2. gtag.js library (strategy="afterInteractive") — the heavy
//     ~153 KB GA library. Loads after hydration. The queued commands
//     from #1 sit in dataLayer until gtag.js processes them, so the
//     first pageview still fires once the library lands.
//
// Why not beforeInteractive on gtag.js too: PSI flagged it as ~1.1 s of
// main-thread blocking + 60 KiB unused JS at first paint. Modern
// Google Tag Assistant + the GA pageview detector execute JS, so tag
// detection no longer requires the script to ship in the static head —
// afterInteractive is the recommended modern strategy. Trade-off: the
// first pageview reaches Google a few hundred ms later than under
// beforeInteractive, but that's invisible to Mike and far better for
// real users on the page.
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
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script id="ga-init" strategy="beforeInteractive">
        {init}
      </Script>
    </>
  );
}
