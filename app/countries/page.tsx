// Legacy /countries — redirected to /countries/cards by next.config.js's
// redirects() rules. This file is an orphan kept around because the
// hostloop sandbox can't delete files; it's never reached at runtime.
import { redirect } from 'next/navigation';

export default function LegacyCountriesPage() {
  redirect('/countries/cards');
}
