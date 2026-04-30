// Add UTM params to outbound links so we can attribute traffic in analytics
// — most useful when the destination is one of our own properties
// (mike-lee.me, ski.mike-lee.me, pounce.mike-lee.me, app.stray.tips) where
// GA on the other side sees the source. Harmless on third-party links
// (Wikipedia, UNESCO, etc.) — they ignore unknown query params.

export type UtmOpts = {
  /** Defaults to 'go.mike-lee.me'. */
  source?: string;
  /** Required. Where on the site the link sits (sidebar, pin-detail, card). */
  medium: string;
  /** Optional. Logical campaign name (e.g. 'pounce', 'wikipedia', 'unesco'). */
  campaign?: string;
  /** Optional. Specific link variant ('hero', 'footer', etc.). */
  content?: string;
};

const DEFAULT_SOURCE = 'go.mike-lee.me';

export function withUtm(url: string | null | undefined, opts: UtmOpts): string {
  if (!url) return '';
  // Skip mailto:, tel:, javascript:, internal, anchor, and obviously broken URLs.
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    // Don't overwrite an existing utm_* the destination might have set.
    if (!u.searchParams.has('utm_source')) {
      u.searchParams.set('utm_source', opts.source ?? DEFAULT_SOURCE);
    }
    if (!u.searchParams.has('utm_medium')) {
      u.searchParams.set('utm_medium', opts.medium);
    }
    if (opts.campaign && !u.searchParams.has('utm_campaign')) {
      u.searchParams.set('utm_campaign', opts.campaign);
    }
    if (opts.content && !u.searchParams.has('utm_content')) {
      u.searchParams.set('utm_content', opts.content);
    }
    return u.toString();
  } catch {
    return url;
  }
}
