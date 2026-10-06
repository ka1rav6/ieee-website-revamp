/**
 * The landing hero.
 *
 * The visual idea is a circuit board coming to life: a faint engineering
 * grid, two slow colour glows, and signal traces whose pulses travel along
 * them. All of it is SVG and CSS - there is no animation loop in JavaScript,
 * so the hero costs nothing per frame on the main thread and stops dead
 * under `prefers-reduced-motion`.
 */

import { Fragment } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useCountUp } from '@/hooks/useInteraction';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { compactNumber } from '@/utils/format';
import { ArrowRightIcon, ArrowUpRightIcon } from '@/components/ui/Icons';
import type { SiteStats } from '@/types/api';

/* --- Background --------------------------------------------------------- */

/**
 * Signal traces. Each path carries a dashed overlay whose offset animates,
 * which reads as a pulse travelling the wire, plus a node that pulses in
 * time at the junction.
 */
function CircuitTraces() {
  const traces = [
    { d: 'M0 120 H180 L240 180 H420 L470 130 H640', delay: 0 },
    { d: 'M0 300 H120 L180 240 H360 L410 290 H560 L600 250 H800', delay: 1.4 },
    { d: 'M0 480 H220 L280 420 H480 L530 470 H720', delay: 2.8 },
    { d: 'M140 0 V90 L200 150 V260', delay: 2.1 },
    { d: 'M520 600 V500 L580 440 V330', delay: 0.7 },
  ];

  const nodes = [
    { cx: 180, cy: 120, delay: 0 },
    { cx: 420, cy: 180, delay: 0.5 },
    { cx: 180, cy: 240, delay: 1.1 },
    { cx: 560, cy: 290, delay: 1.7 },
    { cx: 280, cy: 420, delay: 2.3 },
    { cx: 530, cy: 470, delay: 2.9 },
    { cx: 200, cy: 150, delay: 1.4 },
  ];

  return (
    <svg
      viewBox="0 0 800 600"
      className="absolute inset-0 size-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {traces.map((trace) => (
          <g key={trace.d}>
            {/* The static wire. */}
            <path d={trace.d} opacity="0.1" />
            {/* The pulse: a short dash chased along the same path. */}
            <path
              d={trace.d}
              strokeDasharray="36 284"
              style={{
                animation: `trace-flow 7s linear ${trace.delay}s infinite`,
                opacity: 0.75,
              }}
            />
          </g>
        ))}
      </g>

      <g fill="var(--accent)">
        {nodes.map((node) => (
          <circle
            key={`${node.cx}-${node.cy}`}
            cx={node.cx}
            cy={node.cy}
            r="2"
            style={{ animation: `node-pulse 3.4s ease-in-out ${node.delay}s infinite` }}
          />
        ))}
      </g>
    </svg>
  );
}

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="grid-field absolute inset-0" />

      <CircuitTraces />

      {/* Two slow drifting glows give the flat background some depth. */}
      <div
        className="glow -top-24 -left-20 size-[32rem] bg-[var(--glow-primary)]"
        style={{ animation: 'drift 22s ease-in-out infinite' }}
      />
      <div
        className="glow top-1/3 -right-24 size-[26rem] bg-[var(--glow-secondary)]"
        style={{ animation: 'drift 28s ease-in-out -8s infinite' }}
      />

      {/* Fade into the next section so the hero does not end on a hard edge. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[var(--surface-base)]" />
    </div>
  );
}

/* --- Stats -------------------------------------------------------------- */

function StatTile({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  const { ref, value: displayed } = useCountUp(value);

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className="space-y-1">
      <p className="font-display text-3xl font-bold text-strong tabular md:text-4xl">
        {compactNumber(displayed)}
        {suffix && <span className="text-accent">{suffix}</span>}
      </p>
      <p className="font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase">{label}</p>
    </div>
  );
}

function HeroStats({ stats }: { stats: SiteStats }) {
  const tiles = [
    { value: stats.members, label: 'Members', suffix: '' },
    { value: stats.events, label: 'Events run', suffix: '+' },
    { value: stats.collaborations, label: 'Partners', suffix: '' },
    { value: stats.years_active, label: 'Years active', suffix: '' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-6 border-t border-[var(--border-subtle)] pt-7 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label}>
          <dt className="sr-only">{tile.label}</dt>
          <dd>
            <StatTile value={tile.value} label={tile.label} suffix={tile.suffix} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* --- Hero --------------------------------------------------------------- */

/**
 * One word of the headline, lifted into place.
 *
 * `inline-block` is what makes the word transformable, and keeps it from
 * breaking apart across a line.
 */
function AnimatedWord({
  children,
  index,
  reducedMotion,
}: {
  children: React.ReactNode;
  index: number;
  reducedMotion: boolean | null;
}) {
  return (
    <motion.span
      className="inline-block"
      initial={reducedMotion ? undefined : { opacity: 0, y: '0.4em' }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay: 0.12 + index * 0.055, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.span>
  );
}

export function Hero({ stats }: { stats: SiteStats | null }) {
  const { text, link } = useSiteSettings();
  const reducedMotion = useReducedMotion();
  const joinUrl = link('join_url');

  const heading = text('hero_heading', 'Technology for humanity, built by students.');
  const subheading = text(
    'hero_subheading',
    "The IEEE student branch at IIIT Delhi, where the institute's biggest technical events are imagined, engineered and run.",
  );
  const eyebrow = text('hero_eyebrow', 'In affiliation with IEEE, WIE and Computer Society');

  // The heading animates in a word at a time. Splitting on whitespace keeps
  // words whole, so the line never breaks mid-word while animating.
  const words = heading.split(' ');
  // Where the gradient starts. Painting it once across the trailing words
  // keeps it a single continuous sweep.
  const accentFrom = Math.max(0, words.length - 2);

  return (
    <section className="relative flex min-h-[88svh] items-center overflow-hidden pt-[var(--header-height)]">
      <HeroBackdrop />

      <div className="shell relative py-16 md:py-24">
        <div className="max-w-4xl">
          <motion.p
            className="eyebrow"
            initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {eyebrow}
          </motion.p>

          <h1 className="fluid-display mt-6 font-bold">
            {words.slice(0, accentFrom).map((word, index) => (
              <Fragment key={`lead-${index}`}>
                <AnimatedWord index={index} reducedMotion={reducedMotion}>
                  {word}
                </AnimatedWord>{' '}
              </Fragment>
            ))}
            {/* One gradient box spanning the trailing words, so the sweep runs
                across the phrase instead of restarting at every space. */}
            <span className="text-gradient">
              {words.slice(accentFrom).map((word, index, accentWords) => (
                <Fragment key={`accent-${index}`}>
                  <AnimatedWord index={accentFrom + index} reducedMotion={reducedMotion}>
                    {word}
                  </AnimatedWord>
                  {index < accentWords.length - 1 ? ' ' : null}
                </Fragment>
              ))}
            </span>
          </h1>

          <motion.p
            className="mt-7 max-w-2xl text-lg text-muted md:text-xl"
            initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.1 + words.length * 0.045,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {subheading}
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3"
            initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.18 + words.length * 0.045,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {joinUrl && (
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-lg"
              >
                Join the branch
                <ArrowUpRightIcon className="size-4" />
              </a>
            )}
            <Link to="/events" className="btn btn-secondary btn-lg">
              See what we run
              <ArrowRightIcon className="size-4" />
            </Link>
          </motion.div>

          {stats && (
            <motion.div
              className="mt-14"
              initial={reducedMotion ? undefined : { opacity: 0 }}
              animate={reducedMotion ? undefined : { opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.3 + words.length * 0.045 }}
            >
              <HeroStats stats={stats} />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
