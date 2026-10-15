/**
 * Site header: brand, primary navigation, theme toggle and the join CTA.
 *
 * Fixed and transparent over the hero, gaining a paper background and a hair
 * border once the page scrolls, so the hero reads as full-bleed without the
 * nav ever becoming unreadable over content.
 *
 * Two details are worth the code they cost. A one-pixel rule along the
 * bottom edge is scaled to reading progress, which gives the fixed header
 * something to say on a long article. And the mobile menu is a full-screen
 * navy panel that wipes open on `clip-path` with its items staggered in -
 * at the size the links are set, a dropdown would have looked like an
 * accident.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  useEscapeKey,
  useScrollLock,
  useScrolledPast,
  useScrollProgress,
} from '@/hooks/useInteraction';
import { useOverDarkHero } from '@/hooks/useHeaderTone';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useTheme } from '@/hooks/useTheme';
import { cx } from '@/utils/format';
import { ArrowUpRightIcon, CloseIcon, MoonIcon, SunIcon } from '@/components/ui/Icons';
import { Brand } from './Brand';

const NAV_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/events', label: 'Events' },
  { to: '/blogs', label: 'Blog' },
  { to: '/team', label: 'Team' },
  { to: '/ieee-day', label: 'IEEE Day' },
  { to: '/collaborations', label: 'Collaborate' },
  { to: '/contact', label: 'Contact' },
] as const;

function ThemeToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { resolved, toggle } = useTheme();
  const nextTheme = resolved === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className={cx(
        'grid size-10 place-items-center border transition-colors duration-200',
        tone === 'dark'
          ? 'border-on-contrast/40 text-on-contrast hover:bg-silk hover:text-ink'
          : 'border-line text-muted hover:border-ink hover:text-ink',
      )}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {/* Both icons render and cross-fade, so the swap has no flicker. */}
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

export function Header() {
  const scrolled = useScrolledPast(12);
  const progress = useScrollProgress();
  // Over a navy page header the transparent bar takes light text; once the
  // page scrolls it gains the paper background and goes back to ink.
  const onDark = useOverDarkHero() && !scrolled;
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
    <>
      {/* The first thing in the tab order, so keyboard users can skip the
          nav. White on IEEE blue, which is 6.6:1. */}
      <a
        href="#main"
        className="sr-only-focusable fixed top-3 left-3 z-[100] bg-signal-fill px-4 py-2 text-sm font-semibold text-on-accent"
      >
        Skip to content
      </a>

      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter,color] duration-500',
          onDark ? 'text-on-contrast' : 'text-ink',
          scrolled
            ? 'border-b border-line bg-paper/90 backdrop-blur-md'
            : 'border-b border-transparent',
        )}
      >
        <nav
          aria-label="Primary"
          className="shell flex h-[var(--header-height)] items-center justify-between gap-6"
        >
          <Brand compact tone={onDark ? 'dark' : 'light'} />

          <ul className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className="mono group relative flex items-center gap-2 py-2 whitespace-nowrap"
                >
                  {({ isActive }) => (
                    <>
                      {/* The active marker is a square pip that scales in -
                          and the same pip previews on hover, so the
                          affordance and the state are one shape. */}
                      <span
                        aria-hidden="true"
                        className={cx(
                          'size-1.5 bg-signal transition-transform duration-300',
                          isActive ? 'scale-100' : 'scale-0 group-hover:scale-100',
                        )}
                      />
                      <span className="u-sweep">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <ThemeToggle tone={onDark ? 'dark' : 'light'} />

            {joinUrl && (
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(
                  'btn btn-sm hidden sm:inline-flex',
                  onDark ? 'btn-on-dark' : 'btn-primary',
                )}
              >
                Join
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            )}

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className={cx(
                'mono flex h-10 items-center gap-2 border px-3 transition-colors lg:hidden',
                onDark
                  ? 'border-on-contrast/40 hover:bg-silk hover:text-ink'
                  : 'border-line hover:bg-ink-surface hover:text-on-contrast',
              )}
            >
              Menu
              <span aria-hidden="true" className="flex flex-col gap-[3px]">
                <span className="h-px w-4 bg-current" />
                <span className="h-px w-4 bg-current" />
              </span>
            </button>
          </div>
        </nav>

        {/* Reading progress. `scaleX` on a one-pixel rule costs nothing to
            animate and never triggers layout. */}
        <div
          aria-hidden="true"
          className="h-[2px] origin-left bg-signal"
          style={{ transform: `scaleX(${progress})` }}
        />
      </header>

      {/* Mobile menu. Kept mounted so the wipe can animate both ways, and
          made `inert` while closed so nothing inside it can be tabbed to or
          read out while it is off screen. */}
      <div
        id="mobile-menu"
        inert={!menuOpen}
        aria-hidden={!menuOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={cx(
          'grid-board fixed inset-0 z-[60] flex flex-col bg-board text-on-contrast transition-[clip-path] duration-700 ease-[var(--ease-out-expo)] lg:hidden',
          menuOpen ? '[clip-path:inset(0_0_0_0)]' : '[clip-path:inset(0_0_100%_0)]',
        )}
      >
        <div className="flex h-[var(--header-height)] items-center justify-between px-6">
          <span className="mono opacity-60">Menu</span>
          <div className="flex items-center gap-3">
            <ThemeToggle tone="dark" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
              }}
              aria-label="Close menu"
              className="flex size-10 items-center justify-center border border-on-contrast/40 transition-colors hover:bg-silk hover:text-ink"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>
        </div>

        <ul className="scroll-x flex flex-1 flex-col justify-center gap-1 overflow-y-auto px-6">
          {NAV_LINKS.map((item, index) => (
            <li
              key={item.to}
              className={cx(
                'border-b border-on-contrast/15 transition-all duration-700 ease-[var(--ease-out-expo)]',
                menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
              )}
              // Staggered so the list assembles rather than appearing whole.
              style={{ transitionDelay: menuOpen ? `${160 + index * 60}ms` : '0ms' }}
            >
              <NavLink
                to={item.to}
                className="cond group flex items-baseline justify-between py-3 text-[clamp(2.2rem,11vw,3.6rem)] leading-none transition-colors hover:text-signal-on-dark"
              >
                {item.label}
                <span className="mono text-on-contrast/60">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="space-y-4 px-6 pt-6 pb-8">
          {joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-on-dark w-full"
            >
              Join the branch
              <ArrowUpRightIcon className="size-4" />
            </a>
          )}
          <Link to="/contact" className="mono u-sweep inline-block py-2 text-on-contrast/70">
            Contact the branch
          </Link>
        </div>
      </div>
    </>
  );
}
