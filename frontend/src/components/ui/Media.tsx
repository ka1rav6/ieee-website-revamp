/**
 * Image handling.
 *
 * Images are the heaviest thing on this site, so every one of them is lazy
 * by default, has explicit dimensions or an aspect ratio to prevent layout
 * shift, fades in once decoded, and falls back to something deliberate when
 * the file is missing.
 */

import { useState } from 'react';
import { mediaUrl } from '@/api/client';
import { cx, initials } from '@/utils/format';

interface ImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Tailwind aspect-ratio class, e.g. `aspect-16/10`. */
  aspect?: string;
  /** `eager` for above-the-fold images only. */
  loading?: 'lazy' | 'eager';
  /** Shown in place of a broken or missing image. */
  fallback?: React.ReactNode;
  objectFit?: 'cover' | 'contain';
}

export function Image({
  src,
  alt,
  className,
  aspect,
  loading = 'lazy',
  fallback,
  objectFit = 'cover',
}: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const resolved = mediaUrl(src);

  if (!resolved || failed) {
    return (
      <div
        className={cx(
          'grid place-items-center bg-[var(--surface-sunken)] text-faint',
          aspect,
          className,
        )}
      >
        {fallback ?? (
          <svg viewBox="0 0 24 24" className="size-7 opacity-50" aria-hidden="true" fill="none">
            <rect
              x="3"
              y="5"
              width="18"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="m4 16 4.5-4.5L13 16l3-3 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
    );
  }

  return (
    <div className={cx('relative overflow-hidden bg-[var(--surface-sunken)]', aspect, className)}>
      <img
        src={resolved}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cx(
          'size-full transition-opacity duration-500',
          objectFit === 'cover' ? 'object-cover' : 'object-contain',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

interface AvatarProps {
  src: string | null | undefined;
  name: string;
  className?: string;
  /** Tailwind size class, e.g. `size-10`. */
  size?: string;
}

/**
 * A person's photo, falling back to their initials.
 *
 * Several people on the roster have no photo, and a ring of initials reads
 * as intentional where a broken-image icon would not.
 */
export function Avatar({ src, name, className, size = 'size-10' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const resolved = mediaUrl(src);

  if (!resolved || failed) {
    return (
      <div
        className={cx(
          'grid shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-sunken)] font-mono text-[0.7em] font-medium text-muted',
          size,
          className,
        )}
        aria-hidden="true"
      >
        {initials(name)}
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cx(
        'shrink-0 rounded-full border border-[var(--border-subtle)] object-cover',
        size,
        className,
      )}
    />
  );
}

/**
 * A portrait for a team or alumni card.
 *
 * Photos come from several years of the previous site at inconsistent crops,
 * so a fixed aspect ratio with a top-weighted crop keeps faces in frame and
 * the grid even.
 */
export function Portrait({
  src,
  name,
  className,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const resolved = mediaUrl(src);

  return (
    <div
      className={cx('relative aspect-4/5 overflow-hidden bg-[var(--surface-sunken)]', className)}
    >
      {!resolved || failed ? (
        <div className="grid size-full place-items-center">
          <span className="font-display text-3xl font-semibold text-faint" aria-hidden="true">
            {initials(name)}
          </span>
        </div>
      ) : (
        <img
          src={resolved}
          alt={`${name}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx(
            'size-full object-cover object-top transition-[opacity,transform] duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  );
}

/**
 * An organisation's logo.
 *
 * The imported logos are a mix of light-on-transparent and dark-on-white, so
 * they sit on a neutral tile with padding and are normalised to one height.
 */
export function LogoMark({
  src,
  name,
  className,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = mediaUrl(src);

  if (!resolved || failed) {
    return (
      <span className={cx('font-display text-lg font-semibold text-muted', className)} title={name}>
        {name}
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cx('max-h-9 w-auto object-contain', className)}
    />
  );
}
