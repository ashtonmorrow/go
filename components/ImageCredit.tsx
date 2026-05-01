import type { ImageAttribution } from '@/lib/notion';

/**
 * Compact "Photo by … / License (link) / via Commons" caption.
 *
 * Renders a single line that satisfies CC BY-SA attribution requirements:
 * author, license name, link to license, link back to source. When any
 * field is missing we degrade gracefully — the link to Commons is the
 * minimum and is always present (the source URL is the only required
 * field on ImageAttribution).
 *
 * Variants:
 *   - "caption" — small muted line, suitable for figcaption.
 *   - "tooltip" — string-only, suitable for an HTML title attribute.
 *
 * The tooltip helper is exported separately so non-text contexts (e.g.
 * a card-sized stamp where a visible caption would crowd the layout)
 * can still surface attribution on hover.
 */

export default function ImageCredit({
  attribution,
  className,
}: {
  attribution: ImageAttribution | null;
  className?: string;
}) {
  if (!attribution) return null;
  const { author, license, licenseUrl, sourceUrl } = attribution;
  return (
    <figcaption className={'text-micro text-muted leading-snug ' + (className ?? '')}>
      {author && <>Photo by {author}</>}
      {author && (license || sourceUrl) && <span aria-hidden> · </span>}
      {license && (
        licenseUrl ? (
          <a
            href={licenseUrl}
            target="_blank"
            rel="noopener noreferrer license"
            className="hover:text-ink-deep underline-offset-2 hover:underline"
          >
            {license}
          </a>
        ) : (
          <span>{license}</span>
        )
      )}
      {license && <span aria-hidden> · </span>}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ink-deep underline-offset-2 hover:underline"
      >
        Wikimedia Commons
      </a>
    </figcaption>
  );
}

/** String-only version for `title=` attributes. */
export function imageCreditTitle(attribution: ImageAttribution | null): string | undefined {
  if (!attribution) return undefined;
  const parts: string[] = [];
  if (attribution.author) parts.push(`Photo by ${attribution.author}`);
  if (attribution.license) parts.push(attribution.license);
  parts.push('via Wikimedia Commons');
  return parts.join(' · ');
}
