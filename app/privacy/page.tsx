import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 604800;

export const metadata: Metadata = {
  title: 'Privacy & data',
  description:
    'A personal travel project. I collect basic analytics so I can improve the site, nothing else. Tell me if something is wrong and I will fix it.',
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <article className="max-w-prose mx-auto px-5 py-10 text-ink leading-relaxed">
      <h1 className="text-h1 text-ink-deep mb-2">Privacy &amp; data</h1>
      <p className="text-muted text-small mb-8">
        The short version: this is a personal project, I&rsquo;m not running a business off it,
        and I collect about as little as a static site can.
      </p>

      <section className="mb-6">
        <h2 className="text-h3 text-ink-deep mb-2">What this is</h2>
        <p>
          Hi, I&rsquo;m Mike. This site is the way I keep notes about places I&rsquo;ve been
          and places I want to go. I built it for myself, partly to learn, and I&rsquo;m
          sharing it the way you might share a class notebook with a friend who&rsquo;s
          studying the same thing. There is no monetization here. No ads, no
          subscriptions, no affiliate links, no products. If you want to hire me to build
          something, my LinkedIn is at the bottom of every page.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-h3 text-ink-deep mb-2">What I collect</h2>
        <p className="mb-3">
          <strong>Analytics.</strong> I use Google Analytics and Google Search Console to
          see which pages people find useful and which load slowly, so I can improve the
          site. Those services set cookies. They don&rsquo;t tie your reading here to who
          you are anywhere else.
        </p>
        <p>
          <strong>Nothing else.</strong> No accounts, no email signups, no purchases. I
          don&rsquo;t have your email or any login credentials. If you upload anything to
          this site, it&rsquo;s because you&rsquo;re me.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-h3 text-ink-deep mb-2">Where the data on the site comes from</h2>
        <p>
          Most of what you read here is a mix of public sources (Wikipedia, Wikidata, UNESCO,
          Atlas Obscura, Lonely Planet, NatGeo, TIME) and my own photos, ratings, and
          notes. I link to the original source on each page where it applies. I do my best
          to keep things accurate, but please treat this as travel notes, not a guidebook.
          Hours, prices, and policies change, so double-check anything you&rsquo;re
          actually planning around.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-h3 text-ink-deep mb-2">If something looks wrong</h2>
        <p>
          If something on a page is inaccurate, broken, or you&rsquo;d rather it
          wasn&rsquo;t here, send me a note on{' '}
          <a
            href="https://www.linkedin.com/in/mikelee89/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            LinkedIn
          </a>{' '}
          and I&rsquo;ll fix or remove it. That includes anything you might consider
          personal, including photos that include you, references, or mistakes about a place
          you run.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-h3 text-ink-deep mb-2">Cookies</h2>
        <p>
          By using the site you accept the analytics cookies described above. You can
          block them via your browser&rsquo;s privacy settings if you&rsquo;d rather. The
          banner at the bottom of the page lets you dismiss this notice on this device.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-h3 text-ink-deep mb-2">Contact</h2>
        <p>
          <a
            href="https://www.linkedin.com/in/mikelee89/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            LinkedIn, Mike Lee
          </a>
        </p>
      </section>

      <p className="text-label text-muted mt-12">
        Last updated when this site was last built. This page lives at{' '}
        <code className="font-mono">/privacy</code>.
      </p>
    </article>
  );
}
