import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Go · Mike Lee',
  description: 'Places I\'ve been and places I want to go — a travel atlas by Mike Lee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-sand bg-cream/95 backdrop-blur sticky top-0 z-40">
          <div className="max-w-page mx-auto px-5 h-14 flex items-center justify-between">
            <Link href="/" className="text-ink-deep font-semibold tracking-tight hover:text-teal transition-colors">
              go.mike-lee
            </Link>
            <nav className="flex items-center gap-6 text-small">
              <Link href="/" className="text-ink hover:text-teal">Map</Link>
              <Link href="/cities" className="text-ink hover:text-teal">Cities</Link>
              <a href="https://mike-lee.me" className="text-slate hover:text-teal">mike-lee.me</a>
            </nav>
          </div>
        </header>
        <main className="min-h-screen">{children}</main>
        <footer className="mt-20 border-t border-sand py-8">
          <div className="max-w-page mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-small text-muted">
            <span>© {new Date().getFullYear()} Mike Lee</span>
            <span>
              Data from Notion · map by Google · hosted on Vercel
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
