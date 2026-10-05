/**
 * Loading, error and empty states.
 *
 * Every list and page uses these, so a slow network, a failed request and a
 * genuinely empty collection each look deliberate rather than broken, and
 * each one says what the visitor can do next.
 */

import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { cx } from '@/utils/format';
import { AlertIcon, InboxIcon, RefreshIcon, WifiOffIcon } from './Icons';

/* --- Loading ------------------------------------------------------------ */

/** A shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

/**
 * A card-shaped placeholder.
 *
 * Mirroring the real card's proportions keeps the layout from jumping when
 * content arrives.
 */
export function SkeletonCard({ lines = 3, media = true }: { lines?: number; media?: boolean }) {
  return (
    <div className="card overflow-hidden p-0">
      {media && <Skeleton className="aspect-16/10 w-full rounded-none" />}
      <div className="space-y-3 p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-4/5" />
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className={cx('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cx('grid gap-6 sm:grid-cols-2 lg:grid-cols-3', className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
      <span className="sr-only">Loading content</span>
    </div>
  );
}

/** Full-page loader, for a route that cannot render anything useful yet. */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4" role="status">
      <div
        className="size-7 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent)]"
        aria-hidden="true"
      />
      <p className="font-mono text-xs tracking-widest text-muted uppercase">{label}</p>
    </div>
  );
}

/* --- Error -------------------------------------------------------------- */

interface ErrorStateProps {
  error: ApiError | Error | null;
  onRetry?: () => void;
  /** Overrides the message derived from the error. */
  title?: string;
  className?: string;
}

/**
 * Report a failure in terms the visitor can act on.
 *
 * A dropped connection and a server fault need different wording, so the
 * message is chosen from the error rather than being one generic string.
 */
export function ErrorState({ error, onRetry, title, className }: ErrorStateProps) {
  const isNetwork = error instanceof ApiError && error.isNetworkError;
  const isRateLimited = error instanceof ApiError && error.isRateLimited;

  const heading =
    title ??
    (isNetwork ? 'No connection' : isRateLimited ? 'Too many requests' : 'Something went wrong');

  const detail =
    error instanceof ApiError
      ? error.message
      : 'An unexpected error occurred. Please try again in a moment.';

  return (
    <div
      className={cx('card flex flex-col items-center gap-4 px-6 py-12 text-center', className)}
      role="alert"
    >
      <span
        className="grid size-11 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-crimson-400)_14%,transparent)] text-[var(--color-crimson-400)]"
        aria-hidden="true"
      >
        {isNetwork ? <WifiOffIcon className="size-5" /> : <AlertIcon className="size-5" />}
      </span>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold">{heading}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted">{detail}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RefreshIcon className="size-4" />
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline form-level error, shown above a form's submit button. */
export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  // Field-level problems are already shown beside each input; repeating them
  // in a banner would be noise.
  const isFieldOnly = Object.keys(error.fields).length > 0 && error.status === 422;

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklab,var(--color-crimson-400)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-crimson-400)_10%,transparent)] px-3.5 py-3 text-sm"
      role="alert"
      aria-live="polite"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--color-crimson-400)]" />
      <span className="text-default">
        {isFieldOnly ? 'Please correct the highlighted fields below.' : error.message}
      </span>
    </div>
  );
}

/* --- Empty -------------------------------------------------------------- */

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] px-6 py-14 text-center',
        className,
      )}
    >
      <span
        className="grid size-11 place-items-center rounded-full bg-[var(--surface-sunken)] text-faint"
        aria-hidden="true"
      >
        {icon ?? <InboxIcon className="size-5" />}
      </span>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* --- Success ------------------------------------------------------------ */

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklab,var(--color-signal-400)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-signal-400)_10%,transparent)] px-3.5 py-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className="mt-0.5 size-4 shrink-0 text-[var(--color-signal-400)]"
        aria-hidden="true"
      >
        <path
          d="M4 10.5 8 14.5 16 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-default">{children}</span>
    </div>
  );
}
