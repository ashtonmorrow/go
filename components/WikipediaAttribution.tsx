// CC BY-SA 4.0 attribution footer for any block that quotes Wikipedia
// summary text (or renders a Commons thumbnail). Required by the license:
// attribution to the article, the license name with link, and an
// indication that the work may be modified (clip, paragraph trim).
//
// Renders as small muted text under the prose. Title is the human
// article name (e.g., "Pyramids of Giza"); url is the canonical
// /wiki/<Title> page on en.wikipedia.org.

export default function WikipediaAttribution({
  title,
  url,
  className,
}: {
  /** Article title to credit, e.g. "Mesa Verde National Park". */
  title: string;
  /** Canonical Wikipedia article URL. */
  url: string;
  className?: string;
}) {
  return (
    <p className={`mt-3 text-label text-muted leading-relaxed ${className ?? ''}`}>
      Summary excerpted from the Wikipedia article{' '}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal hover:underline"
      >
        <em>{title}</em>
      </a>
      , licensed under{' '}
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/"
        target="_blank"
        rel="noopener noreferrer license"
        className="text-teal hover:underline"
      >
        CC BY-SA 4.0
      </a>
      . Text may be clipped or paraphrased to fit this page.
    </p>
  );
}
