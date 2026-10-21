/**
 * Section scaffolding: the band a section sits in, the heading block it
 * shares, and the heading block at the top of a page.
 *
 * The page is a stack of printed cards. Each band overlaps the one above it
 * by a sliver and rounds its leading corners, so scrolling reveals an edge
 * rather than a seam, and alternating tones - paper, sunken, ink, navy - is
 * what gives a long page its rhythm. One system serves the landing page and
 * the interior pages, so a section looks the same wherever it appears.
 */

import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useDarkHero } from '@/hooks/useHeaderTone';
import { cx } from '@/utils/format';
import { ArrowRightIcon } from './Icons';
import { Reveal } from './Reveal';
import { SectionLabel, Words } from './Display';
import { Parallax } from './Scroll';
import type { ReactNode } from 'react';

/** The grounds a band can sit on. */
export type Tone = 'paper' | 'sunken' | 'contrast' | 'brand' | 'accent';

const TONES: Record<Tone, string> = {
  paper: 'grid-paper bg-paper text-ink',
  sunken: 'bg-paper-2 text-ink',
  contrast: 'bg-ink-surface text-on-contrast',
  brand: 'grid-board bg-board text-on-contrast',
  accent: 'bg-signal-fill text-on-accent',
};

/** The tones whose grain reads as print rather than as a dirty screen. */
const GRAINED: ReadonlySet<Tone> = new Set<Tone>(['contrast', 'brand', 'accent']);

interface SectionProps {
  children: ReactNode;
  id?: string;
  className?: string;
  tone?: Tone;
  /** Tighter vertical padding, for sections that follow one another closely. */
  compact?: boolean;
  /**
   * Overlap the section above. Turn this off for the first band after a
   * page header, which has nothing to overlap and would otherwise pull up
   * under it.
   */
  overlap?: boolean;
  /** Draws a trace across the top of the band, pulsed by scroll. */
  divided?: boolean;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}

export function Section({
  children,
  id,
  className,
  tone = 'paper',
  compact = false,
  overlap = true,
  divided = false,
  ...rest
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative',
        TONES[tone],
        // Only the dark grounds take the grain: on paper at the opacity it
        // needs to be visible, it reads as a dirty screen rather than as
        // print.
        GRAINED.has(tone) && 'grain',
        overlap && 'band',
        compact ? 'py-16 sm:py-20' : 'py-24 sm:py-32',
        className,
      )}
      {...rest}
    >
      {divided && <div className="trace-rule absolute inset-x-0 top-0" aria-hidden="true" />}
      {/* Above the grain, which is an ::after on the section itself. */}
      <div className="relative z-10">{children}</div>
    </section>
  );
}

interface SectionHeaderProps {
  /** The number in the `(01) —— Label` annotation. */
  n?: string;
  /** Small mono label above the title. */
  eyebrow?: string;
  /**
   * A string is set with the word-mask entrance, where `\n` breaks a line
   * and `*text*` takes the accent. Pass a node to opt out.
   */
  title: ReactNode;
  description?: ReactNode;
  /** A "view all" style link, placed opposite the title on wide screens. */
  action?: { label: string; to: string };
  align?: 'left' | 'center';
  className?: string;
  /** Heading level, so each page keeps one h1 and a sensible outline. */
  as?: 'h2' | 'h3';
  /** Class for accented words. Dark grounds need the lighter accent. */
  accent?: string;
}

/**
 * The heading block above a section's content.
 *
 * The description sits in its own column opposite the title rather than
 * under it, which is what keeps a 6rem headline from pushing the body copy
 * off the screen.
 */
export function SectionHeader({
  n,
  eyebrow,
  title,
  description,
  action,
  align = 'left',
  className,
  as: Heading = 'h2',
  accent = 'text-signal',
}: SectionHeaderProps) {
  const heading =
    typeof title === 'string' ? (
      <Words as={Heading} className="fluid-heading block" text={title} accent={accent} />
    ) : (
      <Heading className="fluid-heading caps">{title}</Heading>
    );

  return (
    <div
      className={cn(
        'grid gap-8 lg:grid-cols-12 lg:items-end',
        align === 'center' && 'justify-items-center text-center',
        className,
      )}
    >
      <div className={cx('lg:col-span-8', align === 'center' && 'lg:col-span-12')}>
        {(n || eyebrow) && (
          <Reveal>
            {n ? (
              <SectionLabel n={n}>{eyebrow}</SectionLabel>
            ) : (
              <p className={cx('eyebrow', align === 'center' && 'eyebrow-plain')}>{eyebrow}</p>
            )}
          </Reveal>
        )}
        <div className="mt-7">{heading}</div>
      </div>

      {(description || action) && (
        <Reveal
          delay={0.15}
          className={cx(
            'flex flex-col items-start gap-5 lg:col-span-4',
            align === 'center' && 'lg:col-span-12 lg:items-center',
          )}
        >
          {description && (
            <p className="max-w-[42ch] text-base leading-relaxed opacity-70">{description}</p>
          )}
          {action && (
            <Link
              to={action.to}
              className="group inline-flex shrink-0 items-center gap-3 font-display text-[0.8125rem] font-bold tracking-[0.07em] uppercase [font-stretch:100%]"
            >
              <span className="u-sweep">{action.label}</span>
              <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          )}
        </Reveal>
      )}
    </div>
  );
}

/**
 * The heading block at the top of an interior page.
 *
 * Carries the page's single h1 on the navy ground, with the branch name set
 * enormous and nearly invisible behind it - the same device the footer
 * closes on, so interior pages read as part of the same publication.
 */
export function PageHeader({
  eyebrow,
  n,
  title,
  description,
  watermark,
  children,
}: {
  eyebrow?: string;
  n?: string;
  title: string;
  description?: ReactNode;
  /** The oversized lettering behind the heading. Defaults to the title. */
  watermark?: string;
  children?: ReactNode;
}) {
  useDarkHero();

  return (
    <header className="grid-board grain relative overflow-clip bg-board pt-[calc(var(--header-height)+3rem)] pb-20 text-on-contrast md:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-end justify-center overflow-hidden pb-4"
      >
        <Parallax distance={40}>
          <p className="wide text-[22vw] leading-none tracking-[-0.07em] whitespace-nowrap text-on-contrast/[0.05] select-none">
            {watermark ?? title}
          </p>
        </Parallax>
      </div>

      <div className="shell relative z-10">
        <div className="max-w-4xl">
          {(n || eyebrow) && (
            <Reveal>
              {n ? (
                <SectionLabel n={n} className="text-on-contrast/60">
                  {eyebrow}
                </SectionLabel>
              ) : (
                <p className="eyebrow text-on-contrast/60">{eyebrow}</p>
              )}
            </Reveal>
          )}

          <Words
            as="h1"
            className="fluid-heading mt-7 block"
            text={title}
            accent="text-signal-on-dark"
          />

          {description && (
            <Reveal delay={0.2}>
              <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-on-contrast/70">
                {description}
              </p>
            </Reveal>
          )}

          {children}
        </div>
      </div>
    </header>
  );
}
