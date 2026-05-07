'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// Tiny client wrapper that conditionally shows an admin-only edit link
// when the URL has ?admin=1. Lives on detail pages so the page itself
// can stay a pure server component without reading searchParams — that
// read used to make /pins/[slug] and /cities/[slug] force-dynamic and
// blocked them from being ISR'd. The /admin/* path is still gated by
// basic auth in middleware, so this is just a discoverability toggle.
export default function AdminEditLink({
  href,
  label = 'Edit hero photos →',
}: {
  href: string;
  label?: string;
}) {
  const params = useSearchParams();
  if (params.get('admin') !== '1') return null;
  return (
    <div className="mt-2 text-right">
      <Link href={href} className="text-small text-teal hover:underline">
        {label}
      </Link>
    </div>
  );
}
