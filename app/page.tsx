import { redirect } from 'next/navigation';

// Root page — send everyone to /cities, the canonical browse view.
export default function HomePage() {
  redirect('/cities');
}
