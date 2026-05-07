import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 604800;

export const metadata: Metadata = {
  title: 'Privacy and data',
  description:
    'A personal travel project. I do not sell or share information. The site uses Google, Vercel, and Supabase analytics to improve loading and reading. Nothing else.',
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <article className="max-w-prose mx-auto px-5 py-10 text-ink leading-relaxed">
      <header className="mb-10">
        <div className="text-small text-muted mb-3">
          <Link href="/cities">Postcards</Link>
          <span className="mx-1.5">/</span>
          <span>Privacy</span>
        </div>
        <h1 className="text-h1 text-ink-deep">Privacy and data</h1>
        <p className="mt-3 text-prose text-slate font-normal leading-snug max-w-prose">
          The short version: I do not run a business off this. I do not
          sell or share your information. The only data the site collects
          is the kind of analytics that tells me which page is slow and
          which page actually gets read.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">What this is</h2>
        <p>
          I am Mike Lee. I work in tech and have been keeping these
          travel notes for years. The site is the public version of
          that notebook. There are no ads, no sponsored placements, no
          affiliate links, no email signups, no accounts.
        </p>
        <p className="mt-4">
          I treat the project partly as a way to test ideas for my
          professional career. Architecture choices, editorial tone, the
          data pipeline, the way structured fields meet personal prose:
          these are problems I think about in my day job, and the site
          is where I practice them in public on a topic I actually care
          about.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">What the site collects</h2>
        <p>
          Three analytics tools, all aimed at making the site load
          faster and read better:
        </p>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li>
            <strong className="text-ink-deep">Google Analytics 4.</strong>{' '}
            Which pages people land on, where they came from, how long
            they stay. Consent Mode v2 is on, so analytics fire only
            after you accept the cookie banner.
          </li>
          <li>
            <strong className="text-ink-deep">
              Vercel Analytics and Speed Insights.
            </strong>{' '}
            Server response times and Web Vitals. This is how I find out
            which page is slow on a real device.
          </li>
          <li>
            <strong className="text-ink-deep">Supabase request logs.</strong>{' '}
            Server-side database operations only. No reader-level
            tracking.
          </li>
        </ul>
        <p className="mt-4">
          That is the full list. No accounts, no email collection, no
          purchase flow, no profile.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">What I do not do</h2>
        <p>
          I do not sell, share, or trade anyone&rsquo;s data. There is
          no advertising network behind any page. No third party other
          than the analytics tools above receives data about your
          visit. If you upload a photo or write a review on the site,
          that is because you are me. There is no public posting flow.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">
          Where the data on the site comes from
        </h2>
        <p>
          Most of what you read mixes public sources (Wikipedia,
          Wikidata, UNESCO, Atlas Obscura, the Michelin Guide,
          OpenStreetMap, NASA POWER, regional flag libraries) with my
          own photos, ratings, and notes. The{' '}
          <Link href="/credits" className="text-teal hover:underline">
            credits page
          </Link>{' '}
          lists every source with its license and attribution. Reviews
          and personal commentary are mine. Hours, prices, and policies
          change faster than a personal site can guarantee, so check the
          live source before booking.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">
          If something looks wrong
        </h2>
        <p>
          If a fact is off, an attribution missing, a photo includes you
          and you would prefer it not, or you run a place that is
          described unfairly,{' '}
          <a
            href="https://www.linkedin.com/in/mikelee89/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            message me on LinkedIn
          </a>{' '}
          and I will fix or remove it. The reviews are my own and I am
          happy to clarify how I arrived at one.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">Cookies</h2>
        <p>
          Analytics cookies are the only cookies the site sets, and they
          fire only after you accept the cookie banner. Decline or block
          them in your browser settings if you prefer. Declining does
          not change anything you can read or browse here.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-h2 text-ink-deep mb-3">Contact</h2>
        <p>
          <a
            href="https://www.linkedin.com/in/mikelee89/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            LinkedIn (Mike Lee)
          </a>{' '}
          is the canonical channel for anything related to this site.
          There are no comments here on purpose; a direct message is the
          way to reach me.
        </p>
      </section>

      <p className="text-label text-muted mt-12">
        Last updated when this site was last built. This page lives at{' '}
        <code className="font-mono">/privacy</code>.
      </p>
    </article>
  );
}
