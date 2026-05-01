import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-sand bg-cream-soft">
        <div className="max-w-page mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-small">
            <Link href="/" className="text-ink-deep hover:text-teal font-medium">
              ← Site
            </Link>
            <span className="text-muted">·</span>
            <span className="text-muted uppercase tracking-wider text-label">Admin</span>
          </div>
          <nav className="flex items-center gap-4 text-small">
            <Link href="/admin/upload" className="text-ink hover:text-teal">
              Upload photos
            </Link>
            <Link href="/admin/reservations/new" className="text-ink hover:text-teal">
              Add past stay
            </Link>
            <Link href="/admin/pins" className="text-ink hover:text-teal">
              Edit pins
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
