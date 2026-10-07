/**
 * Section scaffolding: the heading block every section shares, and the
 * wrapper that gives sections their vertical rhythm and optional backdrop.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@/utils/format';
import { ArrowRightIcon } from './Icons';
import { Reveal } from './Reveal';
import { Parallax } from './Scroll';

interface SectionHeaderProps {
  /** Small mono label above the title. */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** A "view all" style link, placed opposite the title on wide screens. */
  action?: { label: string; to: string };
  align?: 'left' | 'center';
  className?: string;
  /** Heading level, so each page keeps one h1 and a sensible outline. */
  as?: 'h2' | 'h3';
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
  className,
  as: Heading = 'h2',
}: SectionHeaderProps) {
  return (
    <Reveal
      className={cx(
        'flex flex-col gap-5 md:flex-row md:items-end md:justify-between',
        align === 'center' && 'md:flex-col md:items-center',
        className,
      )}
    >
      <div className={cx('max-w-2xl space-y-3', align === 'center' && 'mx-auto text-center')}>
        {eyebrow && (
          <p className={cx('eyebrow', align === 'center' && 'eyebrow-plain')}>{eyebrow}</p>
        )}
        <Heading className="fluid-heading font-semibold">{title}</Heading>
        {description && <p className="text-base text-muted md:text-lg">{description}</p>}
      </div>

      {action && (
        <Link
          to={action.to}
          className="group inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-strong"
        >
          <span className="link-draw">{action.label}</span>
          <ArrowRightIcon className="size-4 text-accent transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </Reveal>
  );
}

interface SectionProps {
  children: ReactNode;
  id?: string;
  className?: string;
  /** `sunken` tints the band so adjacent sections read as separate. */
  tone?: 'base' | 'sunken';
  /** Tighter vertical padding, for sections that follow one another closely. */
  compact?: boolean;
  /** Draws a trace across the top of the band, pulsed by scroll. */
  divided?: boolean;
  'aria-labelledby'?: string;
}

export function Section({
  children,
  id,
  className,
  tone = 'base',
  compact = false,
  divided = false,
  ...rest
}: SectionProps) {
  return (
    <section
      id={id}
      className={cx(
        'relative',
        compact ? 'py-14 md:py-20' : 'py-20 md:py-28',
        tone === 'sunken' && 'bg-[var(--surface-sunken)]',
        className,
      )}
      {...rest}
    >
      {divided && <div className="trace-rule absolute inset-x-0 top-0" aria-hidden="true" />}
      {children}
    </section>
  );
}

/**
 * The heading block at the top of a page.
 *
 * Carries the single h1 and sits against the same grid and glow treatment as
 * the landing hero, so interior pages feel part of the same site.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-[var(--border-subtle)] pt-[calc(var(--header-height)+3.5rem)] pb-14 md:pt-[calc(var(--header-height)+5rem)] md:pb-20">
      <Parallax className="absolute inset-0" distance={40}>
        <div className="grid-field absolute inset-0" />
        <div className="glow -top-32 left-1/4 size-80 bg-[var(--glow-primary)]" />
        <div className="glow top-1/2 right-0 size-72 bg-[var(--glow-signal)]" />
      </Parallax>
      <div className="shell relative">
        <div className="max-w-3xl space-y-4">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="fluid-heading font-semibold md:text-5xl">{title}</h1>
          {description && <p className="max-w-2xl text-lg text-muted">{description}</p>}
          {children}
        </div>
      </div>
    </header>
  );
}
