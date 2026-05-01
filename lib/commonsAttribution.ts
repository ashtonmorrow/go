/**
 * Wikimedia Commons attribution lookup.
 *
 * Civic flags + some hero images on the atlas were sourced from Commons.
 * Most Commons content is CC BY-SA, which requires author + license credit
 * to travel with each image. Earlier in the project we just stored the URL
 * and lost the metadata; this module backfills it.
 *
 * Usage:
 *   const meta = await fetchCommonsAttribution(commonsUrl);
 *   // meta = { author, license, licenseUrl, sourceUrl, fetchedAt } | null
 *
 * Lookup is two steps:
 *   1. Parse the URL → canonical filename. Commons URLs come in three shapes:
 *        - https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg
 *        - https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo.jpg/640px-Foo.jpg
 *        - https://commons.wikimedia.org/wiki/File:Foo.jpg
 *      All resolve to "Foo.jpg".
 *   2. Call MediaWiki imageinfo with prop=extmetadata. The extmetadata blob
 *      includes Artist (author HTML), LicenseShortName, LicenseUrl, Credit,
 *      Permission. We strip HTML and surface the canonical fields.
 */

export type CommonsAttribution = {
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string;
  fetchedAt: string;
};

const COMMONS_HOST = 'commons.wikimedia.org';
const UPLOAD_HOST = 'upload.wikimedia.org';

/** Detect whether a URL points at Wikimedia Commons (or its CDN). */
export function isCommonsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === COMMONS_HOST || u.hostname === UPLOAD_HOST;
  } catch {
    return false;
  }
}

/** Extract the bare filename from any of the three Commons URL shapes. */
export function commonsUrlToFilename(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === COMMONS_HOST) {
      const m = u.pathname.match(/\/wiki\/(?:File|Image):(.+)$/);
      return m ? decodeURIComponent(m[1].replace(/\?.*$/, '')) : null;
    }
    if (u.hostname === UPLOAD_HOST) {
      // Two layouts:
      //   /wikipedia/commons/a/ab/Foo.jpg                       (original)
      //   /wikipedia/commons/thumb/a/ab/Foo.jpg/640px-Foo.jpg   (thumbnail)
      // The original filename appears at index 4 in both cases (5th segment).
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.indexOf('commons');
      if (i < 0) return null;
      const rest = parts.slice(i + 1);
      // Skip a leading "thumb" segment if present.
      const tail = rest[0] === 'thumb' ? rest.slice(1) : rest;
      // Now tail is [hash1, hash2, filename, (size-prefix-filename)?]
      if (tail.length < 3) return null;
      return decodeURIComponent(tail[2]);
    }
    return null;
  } catch {
    return null;
  }
}

/** Strip HTML tags + collapse whitespace. extmetadata Artist is HTML. */
function stripHtml(html: string | undefined | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * Fetch attribution metadata for a Commons-hosted image. Returns null when
 * the URL isn't a Commons image, the file is missing, or the API errors.
 *
 * No caching here — callers either run this in a one-shot script (the
 * backfill) or wrap in unstable_cache themselves at the page boundary.
 */
export async function fetchCommonsAttribution(url: string): Promise<CommonsAttribution | null> {
  const filename = commonsUrlToFilename(url);
  if (!filename) return null;

  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
  apiUrl.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    titles: `File:${filename}`,
    origin: '*',
  }).toString();

  let res: Response;
  try {
    res = await fetch(apiUrl.toString(), {
      headers: {
        'User-Agent': 'go.mike-lee.me/1.0 (mikeyle3@gmail.com) attribution backfill',
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: any;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const pages = data?.query?.pages;
  if (!pages || typeof pages !== 'object') return null;
  const firstKey = Object.keys(pages)[0];
  const page = pages[firstKey];
  if (!page || page.missing != null) return null;

  const meta = page.imageinfo?.[0]?.extmetadata;
  if (!meta) return null;

  const author = stripHtml(meta.Artist?.value);
  const license = stripHtml(meta.LicenseShortName?.value);
  const licenseUrl = typeof meta.LicenseUrl?.value === 'string' ? meta.LicenseUrl.value : null;
  const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`;

  // If the file gave us nothing useful (no author and no license string),
  // treat it as a missing record rather than an empty attribution.
  if (!author && !license) return null;

  return {
    author,
    license,
    licenseUrl,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}
