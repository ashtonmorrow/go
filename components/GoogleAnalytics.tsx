// === Google Analytics 4 ====================================================
// Server component that emits raw <script> tags. Mounted inside the
// <head> of app/layout.tsx so the rendered HTML matches the snippet
// Google's setup wizard hands you — first-pass detection works, GA's
// "wasn't detected" warning clears.
//
// Why not next/script? <Script strategy="afterInteractive"> injects the
// tag at the end of <body>, not <head>. The site still loads gtag and
// real analytics works, but Google's first-load detector scrapes only
// <head> and reports a false negative. Rendering raw <script> tags here
// puts them where the detector expects.
//
// Consent Mode v2 stays intact: the inline init script defaults
// analytics_storage to 'denied' and only flips to 'granted' once the
// user clicks OK on the cookie banner (which dispatches a
// 'go-cookies-acked' window event) OR once we read the existing
// localStorage flag from a prior visit. Both code paths inline below
// so we don't need a separate client component to wire them up.
//
// Env var NEXT_PUBLIC_GA_MEASUREMENT_ID overrides the hardcoded ID
// (useful for staging or forks). The ID is public — it ships in every
// page's HTML — so a code-level default is fine.

const STORAGE_KEY = 'go-cookies-acked-v1';
const GRANT_EVENT = 'go-cookies-acked';

const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-V0ZWBL66ZK';

export default function GoogleAnalytics() {
  if (!GA_ID) return null;

  // Inline init script. Order matters: consent default MUST run before
  // the config call so the first pageview honours the deny state. Then
  // we restore consent for returning visitors and wire the event
  // listener for first-time consent grants — both inside the same
  // <script> so they run synchronously after gtag is defined.
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
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <script dangerouslySetInnerHTML={{ __html: init }} />
    </>
  );
}
