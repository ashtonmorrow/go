import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Go · Mike Lee',
  description: 'Places I\'ve been and places I want to go — a travel atlas by Mike Lee.',
};

// Nav links match mike-lee.me — same set of pills, same order, so subdomains feel like one site.
const NAV_LINKS = [
  { label: 'Home', href: 'https://mike-lee.me' },
  { label: 'About', href: 'https://app.mike-lee.me' },
  { label: 'Cat - Ski', href: 'https://ski.mike-lee.me/' },
  { label: 'Stray', href: 'https://app.stray.tips/share/animal/f475e984-b982-4b7f-a913-79fb28ae8bb8' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="sticky top-0 z-40 bg-white">
          <nav className="max-w-page mx-auto px-5 py-3 flex flex-wrap gap-2">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex items-center px-4 py-2 bg-white text-ink-deep text-small font-medium hover:bg-cream-soft transition-colors"
                style={{
                  borderBottom: '1px solid #0f172a',
                  borderRadius: 0,
                  boxShadow:
                    '0 0.6px 0.6px -1.25px rgba(0,0,0,0.18), 0 2.29px 2.29px -2.5px rgba(0,0,0,0.16), 0 10px 10px -3.75px rgba(0,0,0,0.06)',
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <main className="min-h-screen">{children}</main>
        <footer className="mt-20 border-t border-sand py-8">
          <div className="max-w-page mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-small text-muted">
            <span>© {new Date().getFullYear()} Mike Lee</span>
            <span>go.mike-lee.me · synced from Notion · hosted on Vercel</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
