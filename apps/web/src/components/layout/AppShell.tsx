import { LuChevronDown, LuEllipsis, LuLogOut, LuSettings, LuX } from 'react-icons/lu';
import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../features/auth/useAuth';
import { Logo } from '../Logo';
import { NAV_ITEMS } from './nav';

const linkBase =
  'flex h-11 items-center gap-3 rounded-full px-3 text-sm font-medium transition-all duration-200';
const linkClass = ({ isActive }: { isActive: boolean }) =>
  `${linkBase} ${
    isActive
      ? 'bg-brand-50 font-semibold text-brand-700'
      : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
  }`;

/**
 * Responsive application frame: a sticky header on every size, a sidebar from
 * md (a 72px icon rail, expanded from lg), and a bottom tab bar with a "More"
 * sheet on phones.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  // The sheet and the account menu remember the page they were opened on, so navigating closes them.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === location.pathname;
  const setMoreOpen = (open: boolean) => setMoreOpenOn(open ? location.pathname : null);
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === location.pathname;

  const primary = NAV_ITEMS.filter((i) => i.mobilePrimary);
  const secondary = NAV_ITEMS.filter((i) => !i.mobilePrimary);
  const initials = (user?.name ?? '')
    .split(/\s+/)
    .filter((p) => /^[A-Za-z0-9]/.test(p))
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:shadow-card focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-200 bg-surface/95 px-4 backdrop-blur-md md:px-6 lg:h-16 lg:px-8">
        <Link to="/" aria-label="MoneyLens home" className="rounded-full">
          <Logo />
        </Link>
        <div className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpenOn(menuOpen ? null : location.pathname)}
            className="flex h-10 items-center gap-2 rounded-full p-1 text-xs transition-all duration-200 hover:bg-ink-100 lg:h-11 lg:border lg:border-ink-200 lg:pr-3"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-2xs font-semibold text-white">
              {initials || 'ML'}
            </span>
            <span className="hidden text-left lg:block">
              <span className="block max-w-40 truncate font-medium leading-tight text-ink-900">
                {user?.name}
              </span>
              <span className="block max-w-40 truncate text-2xs leading-tight text-ink-500">
                {user?.email}
              </span>
            </span>
            <LuChevronDown className="hidden size-4 text-ink-500 lg:block" aria-hidden="true" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMenuOpenOn(null)}
              />
              <div className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] animate-pop rounded-2xl border border-ink-200 bg-surface p-2 shadow-lg">
                <div className="px-3 py-3">
                  <p className="truncate text-sm font-semibold text-ink-900">{user?.name}</p>
                  <p className="truncate text-xs text-ink-500">{user?.email}</p>
                </div>
                <Link
                  to="/settings"
                  className={`${linkBase} text-ink-700 hover:bg-ink-100 hover:text-ink-900`}
                >
                  <LuSettings className="size-[18px]" aria-hidden="true" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className={`${linkBase} w-full text-negative hover:bg-negative-50`}
                >
                  <LuLogOut className="size-[18px]" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex min-w-0 flex-1">
        {/* Sidebar: icon rail from md, expanded from lg */}
        <aside className="hidden w-[72px] shrink-0 border-r border-ink-200 bg-surface p-3 md:sticky md:top-14 md:block md:h-[calc(100dvh-3.5rem)] lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-[248px] lg:p-4">
          <p className="mb-2 hidden px-3 text-2xs font-semibold tracking-[.06em] text-ink-500 uppercase lg:block">
            Menu
          </p>
          <nav aria-label="Main">
            <ul className="space-y-1">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    title={label}
                    className={(s) => `${linkClass(s)} md:justify-center lg:justify-start`}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    <span className="truncate md:sr-only lg:not-sr-only">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main
          id="main"
          key={location.pathname}
          className="min-w-0 flex-1 animate-page-enter pb-24 md:pb-0"
        >
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-5">
          {primary.map(({ to, label, shortLabel, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-center gap-1 text-2xs font-medium transition-all duration-200 active:scale-95 ${
                    isActive ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 ${isActive ? 'bg-brand-50' : ''}`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    {shortLabel ?? label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-sheet"
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-2xs font-medium transition-all duration-200 active:scale-95 ${
                moreOpen ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 ${moreOpen ? 'bg-brand-50' : ''}`}
              >
                <LuEllipsis className="size-5" aria-hidden="true" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 animate-fade-in bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="more-sheet"
            className="absolute inset-x-0 bottom-0 animate-sheet-up rounded-t-3xl bg-surface px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-base font-semibold tracking-tight">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="-mr-2 flex size-10 items-center justify-center rounded-full text-ink-700 transition-all duration-200 hover:bg-ink-100 hover:text-ink-900"
                aria-label="Close"
              >
                <LuX className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-1">
              {secondary.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={linkClass}>
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => void logout()}
                className={`${linkBase} w-full text-ink-700 hover:bg-ink-100 hover:text-ink-900`}
              >
                <LuLogOut className="size-5" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status">
      <span className="size-6 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
