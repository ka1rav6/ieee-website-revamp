/**
 * The admin shell: sidebar, header, and the gate that keeps everything
 * behind it private.
 *
 * The gate is a convenience, not the security boundary - every admin request
 * is authorised server-side. Hiding the UI just stops a signed-out visitor
 * seeing a dashboard full of failed requests.
 */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { adminApi } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { useScrollLock } from '@/hooks/useInteraction';
import { useTheme } from '@/hooks/useTheme';
import { cx } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { BrandMark } from '@/components/layout/Brand';
import { PageLoader } from '@/components/ui/States';
import {
  ArrowUpRightIcon,
  BookIcon,
  BuildingIcon,
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  InboxIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SettingsIcon,
  SparkIcon,
  SunIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import AdminLoginPage from './AdminLoginPage';

const NAV = [
  { to: '/admin', end: true, label: 'Overview', icon: DashboardIcon },
  { to: '/admin/blogs', label: 'Blog', icon: BookIcon },
  { to: '/admin/events', label: 'Events', icon: CalendarIcon },
  { to: '/admin/team', label: 'Team', icon: UsersIcon },
  { to: '/admin/alumni', label: 'Alumni', icon: UsersIcon },
  { to: '/admin/collaborations', label: 'Collaborations', icon: BuildingIcon },
  { to: '/admin/ieee-day', label: 'IEEE Day', icon: SparkIcon },
  { to: '/admin/submissions', label: 'Inbox', icon: InboxIcon, badge: 'unread' },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
] as const;

/** Count of unread submissions, for the inbox badge. */
function useUnreadCount(): number {
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  // Re-checked on navigation, which is frequent enough to stay accurate
  // without polling.
  useEffect(() => {
    let active = true;
    adminApi.submissions
      .unreadCount()
      .then((result) => {
        if (active) setUnread(result.unread);
      })
      .catch(() => {
        // A failure here must not break the chrome around the page.
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  return unread;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const unread = useUnreadCount();

  return (
    <nav aria-label="Dashboard" className="flex h-full flex-col gap-1 p-4">
      <ul className="flex-1 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const showBadge = 'badge' in item && item.badge === 'unread' && unread > 0;

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={'end' in item ? item.end : false}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200',
                    isActive
                      ? 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-strong'
                      : 'text-muted hover:bg-[var(--surface-sunken)] hover:text-strong',
                  )
                }
              >
                <Icon className="size-[1.0625rem] shrink-0" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center font-mono text-[0.625rem] font-semibold text-[var(--surface-base)] tabular">
                    {unread}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:text-strong"
      >
        <ArrowUpRightIcon className="size-[1.0625rem]" />
        View the site
      </a>
    </nav>
  );
}

export function AdminLayout() {
  const { admin, initialising, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useScrollLock(menuOpen);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (initialising) return <PageLoader label="Checking your session" />;
  if (!admin) return <AdminLoginPage />;

  return (
    <div className="min-h-dvh bg-[var(--surface-base)]">
      {/* The dashboard must never appear in a search index. */}
      <Seo title="Dashboard" noIndex />

      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="grid size-9 place-items-center rounded-lg border border-[var(--border-subtle)] text-strong lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="admin-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
            </button>

            <span className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <span className="leading-none">
                <span className="block font-display text-sm font-bold text-strong">
                  IEEE IIIT Delhi
                </span>
                <span className="block font-mono text-[0.625rem] tracking-[0.14em] text-muted uppercase">
                  Dashboard
                </span>
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs text-muted sm:block">{admin.email}</span>

            <button
              type="button"
              onClick={toggle}
              className="grid size-9 place-items-center rounded-lg border border-[var(--border-subtle)] text-muted transition-colors hover:text-strong"
              aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
            >
              {resolved === 'dark' ? (
                <MoonIcon className="size-[1.0625rem]" />
              ) : (
                <SunIcon className="size-[1.0625rem]" />
              )}
            </button>

            <button type="button" onClick={signOut} className="btn btn-secondary btn-sm">
              <LogOutIcon className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[100rem]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-[var(--border-subtle)] lg:block">
          <Sidebar />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 top-16 z-30 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--surface-inverted)_45%,transparent)]"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              tabIndex={-1}
            />
            <div
              id="admin-nav"
              className="relative h-full w-64 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-raised)]"
            >
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
