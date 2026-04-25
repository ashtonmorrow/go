import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { CityFiltersProvider } from '@/components/CityFiltersContext';

export const metadata: Metadata = {
  title: 'Go · Mike Lee',
  description: 'Places I\'ve been and places I want to go — a travel atlas by Mike Lee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Two-column app shell: persistent left sidebar, scrollable main.
            On mobile (< md) the sidebar collapses into a top bar + drawer
            (rendered inside <Sidebar /> itself) so this flex layout still
            works; the drawer is fixed-positioned and doesn't affect flow. */}
        <CityFiltersProvider>
          <div className="md:flex md:min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </CityFiltersProvider>
      </body>
    </html>
  );
}
