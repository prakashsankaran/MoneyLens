import { Ellipsis, LogOut, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../features/auth/useAuth';
import { Logo } from '../Logo';
import { NAV_ITEMS } from './nav';

const linkBase =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const linkClass = ({ isActive }: { isActive: boolean }) =>
  `${linkBase} ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100'}`;

/**
 * Responsive application frame: a sidebar on large screens and a bottom tab bar
 * with a "More" sheet on small screens.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  // The sheet remembers the page it was opened on, so navigating closes it.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === location.pathname;
  const setMoreOpen = (open: boolean) => setMoreOpenOn(open ? location.pathname : null);

  const primary = NAV_ITEMS.filter((i) => i.mobilePrimary);
  const secondary = NAV_ITEMS.filter((i) => !i.mobilePrimary);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-surface px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Logo className="px-3" />
        <nav aria-label="Main" className="mt-10 flex-1 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-100 pt-4">
          <p className="truncate px-3 text-sm font-medium">{user?.name}</p>
          <p className="truncate px-3 text-xs text-ink-500">{user?.email}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className={`${linkBase} mt-3 w-full text-ink-700 hover:bg-ink-100`}
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-ink-100 bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Logo />
      </header>

      <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {primary.map(({ to, label, shortLabel, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                    isActive ? 'text-brand-700' : 'text-ink-500'
                  }`
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                {shortLabel ?? label}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-sheet"
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                moreOpen ? 'text-brand-700' : 'text-ink-500'
              }`}
            >
              <Ellipsis className="size-5" aria-hidden="true" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink-900/30"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="more-sheet"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-sm font-semibold">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
                aria-label="Close"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-1">
              {secondary.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={linkClass}>
                  <Icon className="size-[18px]" aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => void logout()}
                className={`${linkBase} w-full text-ink-700 hover:bg-ink-100`}
              >
                <LogOut className="size-[18px]" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
