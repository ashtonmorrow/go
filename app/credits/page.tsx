import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Sources and credits',
  description:
    'Every data source the atlas pulls from, with license and attribution. Public reference data is cited; reviews and personal commentary are mine.',
  alternates: { canonical: `${SITE_URL}/credits` },
};

// Static page; data here only changes when we add or remove a source.
export const revalidate = false;

export default function CreditsPage() {
  return (
    <article className="max-w-prose mx-auto px-5 py-10">
      <header className="mb-10">
        <div className="text-small text-muted mb-3">
          <Link href="/cities">Postcards</Link>
          <span className="mx-1.5">/</span>
          <span>Credits</span>
        </div>
        <h1 className="text-h1 text-ink-deep">Sources and credits</h1>
        <p className="mt-3 text-prose text-slate leading-snug max-w-prose">
          The atlas pulls from a few public reference sources for facts
          and a few open-data libraries for icons and tiles. Each one is
          credited here so the projects, datasets, and maintainers
          doing the heavy lifting are visible.
        </p>
      </header>

      <Section id="reviews-and-commentary" title="Reviews and personal commentary">
        <p>
          Photographs, ratings, lists, reviews, and practical
          judgments are mine. The voice on a city page or pin page is
          mine. If a review feels unfair or a fact is wrong, I am happy
          to clarify how I arrived at it. Direct message on{' '}
          <Ext href="https://www.linkedin.com/in/mikelee89/">LinkedIn</Ext>{' '}
          is the fastest way to reach me; there are no comments on the
          site on purpose.
        </p>
      </Section>

      <Section id="wikipedia" title="Wikipedia article excerpts and thumbnails">
        <p>
          The lead paragraph on a city, country, or pin page is often
          the article summary returned by the Wikipedia REST API.
          Article text is licensed under{' '}
          <Ext href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </Ext>
          . Each block that quotes a Wikipedia article carries an
          attribution footer with the article title and license link.
          Wikipedia content is generously made available by the{' '}
          <Ext href="https://en.wikipedia.org/">English Wikipedia</Ext>{' '}
          community.
        </p>
        <p>
          Where a pin uses a Wikipedia thumbnail as a fallback hero,
          the image carries its own credit on the source article
          (photographer plus license). Click through to the article to
          see the file metadata.
        </p>
      </Section>

      <Section id="wikidata" title="Structured facts (Wikidata)">
        <p>
          Population, area, GDP, HDI, life expectancy, civic flags, and
          coats of arms come from{' '}
          <Ext href="https://www.wikidata.org/">Wikidata</Ext>, made
          available under{' '}
          <Ext href="https://creativecommons.org/publicdomain/zero/1.0/">
            CC0
          </Ext>
          . City flags are pulled via{' '}
          <Ext href="https://www.wikidata.org/wiki/Property:P41">
            P41 (flag image)
          </Ext>{' '}
          and{' '}
          <Ext href="https://www.wikidata.org/wiki/Property:P94">
            P94 (coat of arms image)
          </Ext>
          , then served from{' '}
          <Ext href="https://commons.wikimedia.org/">Wikimedia Commons</Ext>.
        </p>
      </Section>

      <Section id="unesco" title="UNESCO World Heritage list">
        <p>
          The UNESCO ID on a pin links to the canonical entry on the{' '}
          <Ext href="https://whc.unesco.org/en/list/">
            World Heritage List
          </Ext>
          . The list itself is the authoritative source for inscription
          year, criteria, and site name; the atlas only stores the ID
          and links out for the rest.
        </p>
      </Section>

      <Section id="atlas-obscura" title="Atlas Obscura history">
        <p>
          Pins tagged Atlas Obscura come from my personal &ldquo;Been
          Here&rdquo; history on{' '}
          <Ext href="https://www.atlasobscura.com/">atlasobscura.com</Ext>
          . The Atlas Obscura slug on a pin links back to their canonical
          entry, which is where the editorial copy and photos for that
          place live. The site is wonderful and worth supporting.
        </p>
      </Section>

      <Section id="michelin-guide" title="Michelin Guide restaurants">
        <p>
          Restaurants tagged with Bib Gourmand or a Michelin star
          designation reflect the entries listed on the{' '}
          <Ext href="https://guide.michelin.com/">Michelin Guide</Ext>{' '}
          at the time I dined. The atlas only carries Michelin entries
          I have actually eaten at, with a personal review and
          price-tier note. The Michelin star and Bib Gourmand marks are
          trademarks of Michelin; this site is not affiliated with or
          endorsed by them.
        </p>
      </Section>

      <Section id="google-places" title="Google Maps and Google Places">
        <p>
          Saved lists are exported from my Google Maps account via{' '}
          <Ext href="https://takeout.google.com/">Google Takeout</Ext>{' '}
          and curated into the{' '}
          <Link href="/lists" className="text-teal hover:underline">
            Lists section
          </Link>
          . Pin enrichment data (opening hours, current price level,
          phone number, average rating) is fetched from the Google
          Places API on a periodic refresh. The &ldquo;Open in Google
          Maps&rdquo; link on each pin is generated from the pin&rsquo;s
          coordinates.
        </p>
      </Section>

      <Section id="osm" title="Map tiles (OpenStreetMap)">
        <p>
          Postcard back-of-card maps and inline base maps use raster
          tiles from{' '}
          <Ext href="https://www.openstreetmap.org/copyright">
            OpenStreetMap
          </Ext>
          , © OpenStreetMap contributors, available under the{' '}
          <Ext href="https://opendatacommons.org/licenses/odbl/">
            Open Database License
          </Ext>{' '}
          (ODbL). Each map carries the &ldquo;© OpenStreetMap&rdquo;
          attribution overlay required by the tile usage policy.
        </p>
      </Section>

      <Section id="climate" title="Climate (NASA POWER and Open-Meteo)">
        <p>
          The monthly temperature and rainfall chart on each city page
          draws from{' '}
          <Ext href="https://power.larc.nasa.gov/">NASA POWER</Ext>,
          which makes its data freely available with the request that
          publications credit the source. Per their{' '}
          <Ext href="https://power.larc.nasa.gov/docs/services/aknolwedgement/">
            acknowledgment guidance
          </Ext>
          : &ldquo;These data were obtained from the NASA Langley
          Research Center POWER Project funded through the NASA Earth
          Science Directorate Applied Science Program.&rdquo; Where NASA
          POWER does not have a station near the city, the chart falls
          back to{' '}
          <Ext href="https://open-meteo.com/">Open-Meteo</Ext>, used
          under their open API terms.
        </p>
      </Section>

      <Section id="country-flags" title="Country flag icons">
        <p>
          Rectangular country flags come from{' '}
          <Ext href="https://flagcdn.com/">flagcdn.com</Ext>, which
          rehosts the open-source{' '}
          <Ext href="https://github.com/lipis/flag-icons">flag-icons</Ext>{' '}
          collection by Panayiotis Lipiridis. Circular country flag
          badges come from{' '}
          <Ext href="https://github.com/HatScripts/circle-flags">
            HatScripts/circle-flags
          </Ext>{' '}
          by Adam Vaculik. Both libraries are released under the{' '}
          <Ext href="https://opensource.org/licenses/MIT">MIT license</Ext>
          .
        </p>
      </Section>

      <Section id="personal-photographs" title="Personal photographs">
        <p>
          Hero images and gallery photos on pin and city pages are
          mine, taken on the trips the atlas tracks. They are served
          via Supabase Storage and are not licensed for redistribution.
          If you are in one of them and would prefer not to be, message
          me and I will remove the photo.
        </p>
      </Section>

      <Section id="codex-illustrations" title="AI-illustrated cover art">
        <p>
          Some pins that lack a real photograph carry a generated
          art-deco-style poster as the card and fallback hero image.
          These are produced internally for the atlas as placeholder
          covers; they are clearly stylized and are not photographs of
          the place. They are replaced by a personal photo whenever I
          take one.
        </p>
      </Section>

      <footer className="mt-12 pt-6 border-t border-sand text-small text-muted">
        Spot something missing or mis-attributed?{' '}
        <Ext href="https://www.linkedin.com/in/mikelee89/">
          Message me on LinkedIn
        </Ext>{' '}
        or open an issue on the{' '}
        <Ext href="https://github.com/ashtonmorrow/go">site repo</Ext>.
      </footer>
    </article>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 mb-10">
      <h2 className="text-h2 text-ink-deep mb-3">{title}</h2>
      <div className="text-ink leading-relaxed text-prose space-y-3">
        {children}
      </div>
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
