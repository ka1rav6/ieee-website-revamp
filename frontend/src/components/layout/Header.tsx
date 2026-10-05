/**
 * Site header: brand, primary navigation, theme toggle and the join CTA.
 *
 * Sticky and transparent over the hero, gaining a background and a border
 * once the page scrolls, so the hero reads as full-bleed without the nav
 * ever becoming unreadable over content.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEscapeKey, useScrollLock, useScrolledPast } from '@/hooks/useInteraction';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useTheme } from '@/hooks/useTheme';
import { cx } from '@/utils/format';
import { ArrowUpRightIcon, CloseIcon, MenuIcon, MoonIcon, SunIcon } from '@/components/ui/Icons';
import { Brand } from './Brand';

const NAV_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/events', label: 'Events' },
  { to: '/blogs', label: 'Blog' },
  { to: '/team', label: 'Team' },
  { to: '/ieee-day', label: 'IEEE Day' },
  { to: '/collaborations', label: 'Collaborate' },
] as const;

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const nextTheme = resolved === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-lg border border-[var(--border-subtle)] text-muted transition-colors duration-200 hover:border-[var(--border-default)] hover:text-strong"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {/* Both icons are rendered and cross-faded so the swap has no flicker. */}
      <span className="relative grid size-5 place-items-center">
        <SunIcon
          className={cx(
            'absolute size-5 transition-all duration-300',
            resolved === 'dark' ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
          )}
        />
        <MoonIcon
          className={cx(
            'absolute size-5 transition-all duration-300',
            resolved === 'dark' ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
          )}
        />
      </span>
    </button>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'relative px-3 py-2 text-sm font-medium transition-colors duration-200',
    isActive ? 'text-strong' : 'text-muted hover:text-strong',
  );
}

export function Header() {
  const scrolled = useScrolledPast(24);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { link } = useSiteSettings();
  const joinUrl = link('join_url');
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Close the menu on navigation, so following a link never leaves the
  // overlay covering the page it went to.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useScrollLock(menuOpen);
  useEscapeKey(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }, menuOpen);

  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled || menuOpen
          ? 'border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface-base)_88%,transparent)] backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      {/* The first thing in the tab order, so keyboard users can skip the nav. */}
      <a
        href="#main"
        className="sr-only-focusable absolute top-3 left-4 z-10 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm font-semibold shadow-[var(--shadow-lifted)]"
      >
        Skip to content
      </a>

      <div className="shell flex h-[var(--header-height)] items-center justify-between gap-4">
        <Brand compact />

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV_LINKS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClass}>
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {/* The active marker is a bar under the label, not just
                          a colour change. */}
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <Link to="/contact" className="btn btn-secondary btn-sm hidden sm:inline-flex">
            Contact
          </Link>

          {joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm hidden md:inline-flex"
            >
              Join IEEE
              <ArrowUpRightIcon className="size-3.5" />
            </a>
          )}

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 place-items-center rounded-lg border border-[var(--border-subtle)] text-strong lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-menu"
            aria-label="Primary"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-[var(--border-subtle)] bg-[var(--surface-base)] lg:hidden"
          >
            <ul className="shell flex flex-col py-3">
              {NAV_LINKS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center justify-between border-b border-[var(--border-subtle)] py-3.5 text-base font-medium transition-colors',
                        isActive ? 'text-accent' : 'text-default',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li className="flex flex-col gap-2 pt-4">
                <Link to="/contact" className="btn btn-secondary">
                  Contact us
                </Link>
                {joinUrl && (
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Join IEEE
                    <ArrowUpRightIcon className="size-4" />
                  </a>
                )}
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
