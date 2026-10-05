/**
 * The IEEE IIIT Delhi wordmark.
 *
 * Drawn rather than bitmapped so it stays sharp at any size and follows the
 * theme. The mark itself is the IEEE diamond-and-kite form reduced to its
 * geometry: a rotated square with three signal bars across it, which is
 * recognisable at 28px where a detailed logo would turn to mush.
 */

import { Link } from 'react-router-dom';
import { cx } from '@/utils/format';

export function BrandMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>

      {/* The diamond. */}
      <rect
        x="7.5"
        y="7.5"
        width="25"
        height="25"
        rx="4"
        transform="rotate(45 20 20)"
        fill="url(#brand-mark-fill)"
      />

      {/* Three bars reading as a signal trace across the diamond. */}
      <g stroke="var(--text-on-brand)" strokeWidth="2.2" strokeLinecap="round" opacity="0.95">
        <path d="M13 16.5h14" />
        <path d="M13 20h9" />
        <path d="M13 23.5h14" />
      </g>
    </svg>
  );
}

interface BrandProps {
  /** Hide the text on narrow screens, where the mark alone is enough. */
  compact?: boolean;
  className?: string;
}

export function Brand({ compact = false, className }: BrandProps) {
  return (
    <Link
      to="/"
      className={cx('group flex items-center gap-2.5', className)}
      aria-label="IEEE IIIT Delhi, home"
    >
      <BrandMark className="size-9 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-[8deg]" />
      <span className={cx('leading-none', compact && 'hidden sm:block')}>
        <span className="block font-display text-[1.0625rem] font-bold tracking-tight text-strong">
          IEEE
        </span>
        <span className="block font-mono text-[0.625rem] tracking-[0.16em] text-muted uppercase">
          IIIT Delhi
        </span>
      </span>
    </Link>
  );
}
