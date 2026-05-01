import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Image and data credits',
  description:
    'Sources, licenses, and attribution for the third-party images and data sets that power the atlas.',
  alternates: { canonical: `${SITE_URL}/credits` },
};

// Static page; data here only changes when we add or remove a source.
export const revalidate = false;

export default function CreditsPage() {
  return (
    <article className="max-w-page mx-auto px-5 py-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-display text-ink-deep leading-none">Image and data credits</h1>
        <p className="mt-3 text-slate">
          The atlas pulls from a few third-party sources. Each one gets credited
          here so the people, projects, and datasets that did the heavy lifting
          are visible.
        </p>
      </header>

      <Section title="Wikipedia article thumbnails">
        <p>
          On pin detail pages where I haven&rsquo;t taken a photo myself, the
          atlas falls back to the lead image from that place&rsquo;s Wikipedia
          article (via the Wikipedia REST summary API). Each image is credited
          on the Wikipedia article it was lifted from, including the
          photographer and the specific Creative Commons license; the caption
          on the thumbnail links back to that article.
        </p>
        <p>
          Wikipedia article text excerpts are licensed under
          {' '}<Ext href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Ext>.
          Wikipedia content is generously made available by the
          {' '}<Ext href="https://en.wikipedia.org/">English Wikipedia</Ext> community.
        </p>
      </Section>

      <Section title="City flags (Wikimedia Commons via Wikidata)">
        <p>
          Civic flags shown as the postage stamp on city postcards are pulled
          from{' '}<Ext href="https://commons.wikimedia.org/">Wikimedia Commons</Ext>
          {' '}via the Wikidata properties{' '}
          <Ext href="https://www.wikidata.org/wiki/Property:P41">P41 (flag image)</Ext>
          {' '}and{' '}
          <Ext href="https://www.wikidata.org/wiki/Property:P94">P94 (coat of arms image)</Ext>.
          Most of these images are public domain or CC-licensed. The stamp on
          a card is too small for a per-image caption; clicking through to the
          city page does not currently expose the file metadata, but each flag
          can be looked up directly on Commons via the city&rsquo;s
          {' '}<Ext href="https://www.wikidata.org/">Wikidata</Ext> entry.
        </p>
        <p>
          If you spot a flag that should be re-licensed or removed, please get
          in touch &mdash; happy to swap it.
        </p>
      </Section>

      <Section title="Country flags (flagcdn + circle-flags)">
        <p>
          Rectangular country flags come from
          {' '}<Ext href="https://flagcdn.com/">flagcdn.com</Ext>, which
          rehosts the open-source
          {' '}<Ext href="https://github.com/lipis/flag-icons">flag-icons</Ext>
          {' '}collection by Panayiotis Lipiridis. Circular country flag
          badges come from
          {' '}<Ext href="https://github.com/HatScripts/circle-flags">HatScripts/circle-flags</Ext>
          {' '}by Adam Vaculik. Both libraries are released under the
          {' '}<Ext href="https://opensource.org/licenses/MIT">MIT license</Ext>.
        </p>
      </Section>

      <Section title="Climate data (NASA POWER)">
        <p>
          The monthly temperature and rainfall chart on each city page draws
          from{' '}<Ext href="https://power.larc.nasa.gov/">NASA POWER</Ext>,
          which makes its data freely available with the request that
          publications credit the source. Per their
          {' '}<Ext href="https://power.larc.nasa.gov/docs/services/aknolwedgement/">
          acknowledgment guidance</Ext>: &ldquo;These data were obtained from
          the NASA Langley Research Center POWER Project funded through the
          NASA Earth Science Directorate Applied Science Program.&rdquo;
        </p>
      </Section>

      <Section title="Map tiles (OpenStreetMap)">
        <p>
          Postcard back-of-card maps and any inline base map use raster tiles
          from{' '}<Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap</Ext>,
          © OpenStreetMap contributors, available under the
          {' '}<Ext href="https://opendatacommons.org/licenses/odbl/">Open Database License</Ext>
          {' '}(ODbL). Each tile carries the &ldquo;© OpenStreetMap&rdquo;
          attribution overlay required by their tile usage policy.
        </p>
      </Section>

      <Section title="Country travel facts (Wikidata)">
        <p>
          Population, area, GDP, HDI, and life expectancy figures on the
          country pages come from
          {' '}<Ext href="https://www.wikidata.org/">Wikidata</Ext>, made
          available under
          {' '}<Ext href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</Ext>.
        </p>
      </Section>

      <Section title="Personal photographs">
        <p>
          Hero images and gallery photos on pin pages are mine, taken on the
          trips the atlas tracks. They&rsquo;re served via Supabase Storage
          and aren&rsquo;t licensed for redistribution.
        </p>
      </Section>

      <footer className="mt-10 pt-6 border-t border-sand text-small text-muted">
        Spot something missing or mis-attributed?
        {' '}
        <Link href="/privacy" className="hover:text-ink-deep">Privacy &amp; data policy</Link>
        {' '}has a contact note. Or just open an issue on the{' '}
        <Ext href="https://github.com/ashtonmorrow/go">site repo</Ext>.
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-h3 text-ink-deep mb-3">{title}</h2>
      <div className="text-ink leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-teal hover:underline"
    >
      {children}
    </a>
  );
}
