/**
 * The landing hero.
 *
 * The visual idea is a circuit board coming to life: a plated grid, signal
 * traces whose pulses travel along them, copper pads and a part footprint,
 * and glows where the board is lit. It responds to two things the visitor
 * does - the pointer lights the traces under it, and scrolling moves the
 * layers at different rates so the board sits behind the text rather than
 * on it.
 *
 * The cost of all that is deliberately small. The traces are SVG and CSS
 * with no JavaScript animation loop; the pointer reveal is a mask driven by
 * two custom properties; the parallax is one spring per layer. Everything
 * stops dead under `prefers-reduced-motion`.
 */

import { Fragment } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useCountUp, useScrolledPast, useSpotlight } from '@/hooks/useInteraction';
import { usePageParallax, useScrollAway } from '@/hooks/useScrollMotion';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { compactNumber } from '@/utils/format';
import { Magnetic } from '@/components/ui/Interactive';
import { ArrowRightIcon, ArrowUpRightIcon } from '@/components/ui/Icons';
import type { SiteStats } from '@/types/api';

/* --- Background --------------------------------------------------------- */

const TRACES = [
  { d: 'M0 120 H180 L240 180 H420 L470 130 H640', delay: 0 },
  { d: 'M0 300 H120 L180 240 H360 L410 290 H560 L600 250 H800', delay: 1.4 },
  { d: 'M0 480 H220 L280 420 H480 L530 470 H720', delay: 2.8 },
  { d: 'M140 0 V90 L200 150 V260', delay: 2.1 },
  { d: 'M520 600 V500 L580 440 V330', delay: 0.7 },
  { d: 'M800 390 H700 L650 340 H470', delay: 3.5 },
];

const NODES = [
  { cx: 180, cy: 120, delay: 0 },
  { cx: 420, cy: 180, delay: 0.5 },
  { cx: 180, cy: 240, delay: 1.1 },
  { cx: 560, cy: 290, delay: 1.7 },
  { cx: 280, cy: 420, delay: 2.3 },
  { cx: 530, cy: 470, delay: 2.9 },
  { cx: 200, cy: 150, delay: 1.4 },
  { cx: 650, cy: 340, delay: 3.4 },
];

/** Copper pads, as a part would be soldered to. */
const PADS = [
  { x: 236, y: 176, w: 9, h: 9 },
  { x: 406, y: 286, w: 9, h: 9 },
  { x: 276, y: 416, w: 9, h: 9 },
  { x: 646, y: 336, w: 9, h: 9 },
];

/**
 * Signal traces. Each path carries a dashed overlay whose offset animates,
 * which reads as a pulse travelling the wire, plus a node that pulses in
 * time at the junction.
 *
 * `lit` draws the same geometry at full strength; the caller masks that copy
 * to the pointer, so one set of coordinates serves both states.
 */
function CircuitTraces({ lit = false }: { lit?: boolean }) {
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
        strokeWidth={lit ? 1.4 : 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {TRACES.map((trace) => (
          <g key={trace.d}>
            {/* The static wire. */}
            <path d={trace.d} opacity={lit ? 0.5 : 0.1} />
            {/* The pulse: a short dash chased along the same path. */}
            <path
              d={trace.d}
              strokeDasharray="36 284"
              style={{
                animation: `trace-flow 7s linear ${trace.delay}s infinite`,
                opacity: lit ? 1 : 0.75,
              }}
            />
          </g>
        ))}
      </g>

      <g fill="var(--accent)">
        {NODES.map((node) => (
          <circle
            key={`${node.cx}-${node.cy}`}
            cx={node.cx}
            cy={node.cy}
            r="2"
            style={{ animation: `node-pulse 3.4s ease-in-out ${node.delay}s infinite` }}
          />
        ))}
      </g>

      {/* Copper, for the one warm note on an otherwise cyan board. */}
      <g fill="var(--pad)" opacity={lit ? 1 : 0.55}>
        {PADS.map((pad) => (
          <rect key={`${pad.x}-${pad.y}`} x={pad.x} y={pad.y} width={pad.w} height={pad.h} rx="2" />
        ))}
      </g>

      {/* A part footprint, so the board reads as populated rather than bare. */}
      <g
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1"
        opacity={lit ? 0.55 : 0.16}
        strokeLinejoin="round"
      >
        <rect x="330" y="224" width="68" height="44" rx="3" />
        <path d="M330 236h-12M330 250h-12M398 236h12M398 250h12" />
        <circle cx="340" cy="234" r="2" />
      </g>
    </svg>
  );
}

function HeroBackdrop() {
  // Three depths. The grid is nearly fixed, the traces drift, the glows move
  // most - which is the order a real stack of layers would appear to move in.
  const gridY = usePageParallax(30);
  const traceY = usePageParallax(64);
  const glowY = usePageParallax(110);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div className="absolute inset-0" style={{ y: gridY }}>
        <div className="grid-field absolute inset-0" />
      </motion.div>

      <motion.div className="absolute inset-0" style={{ y: traceY }}>
        <CircuitTraces />
        {/* The pointer's copy, masked to a circle around the cursor. */}
        <div className="trace-reveal absolute inset-0">
          <CircuitTraces lit />
        </div>
      </motion.div>

      <motion.div className="absolute inset-0" style={{ y: glowY }}>
        <div
          className="glow -top-24 -left-20 size-[32rem] bg-[var(--glow-primary)]"
          style={{ animation: 'drift 22s ease-in-out infinite' }}
        />
        <div
          className="glow top-1/3 -right-24 size-[26rem] bg-[var(--glow-secondary)]"
          style={{ animation: 'drift 28s ease-in-out -8s infinite' }}
        />
        <div
          className="glow bottom-0 left-1/3 size-[22rem] bg-[var(--glow-signal)]"
          style={{ animation: 'drift 34s ease-in-out -14s infinite' }}
        />
      </motion.div>

      {/* Fade into the next section so the hero does not end on a hard edge. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[var(--surface-base)]" />
    </div>
  );
}

/**
 * The affordance that there is more below.
 *
 * Rendered only while the page is still at the top: once the visitor has
 * scrolled it has served its purpose, and unmounting it is what stops the
 * loop rather than merely hiding it.
 */
function ScrollCue() {
  const scrolled = useScrolledPast(80);
  if (scrolled) return null;

  return (
    <motion.div
      className="absolute inset-x-0 bottom-6 hidden justify-center md:flex"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, delay: 1.2 }}
      aria-hidden="true"
    >
      <span className="flex flex-col items-center gap-2 font-mono text-[0.625rem] tracking-[0.2em] text-faint uppercase">
        Scroll
        <span className="relative h-8 w-px overflow-hidden bg-[var(--border-default)]">
          <span
            className="absolute inset-x-0 top-0 h-3 bg-[var(--accent)]"
            style={{ animation: 'scroll-hint 2.4s ease-in-out infinite' }}
          />
        </span>
      </span>
    </motion.div>
  );
}

/* --- Stats -------------------------------------------------------------- */

function StatTile({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  const { ref, value: displayed } = useCountUp(value);

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className="group space-y-1">
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
      initial={reducedMotion ? undefined : { opacity: 0, y: '0.4em', filter: 'blur(8px)' }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        default: { type: 'spring', visualDuration: 0.7, bounce: 0.1, delay: 0.12 + index * 0.055 },
        opacity: { duration: 0.5, delay: 0.12 + index * 0.055 },
        filter: { duration: 0.6, delay: 0.12 + index * 0.055 },
      }}
    >
      {children}
    </motion.span>
  );
}

export function Hero({ stats }: { stats: SiteStats | null }) {
  const { text, link } = useSiteSettings();
  const reducedMotion = useReducedMotion();
  const joinUrl = link('join_url');

  // The pointer position, published as custom properties for the mask that
  // lights the traces underneath it.
  const { ref: spotlightRef, onPointerMove } = useSpotlight<HTMLElement>();
  // The hero's content gives way as the page scrolls past it, so the board
  // is what is left behind rather than text sliding under the header.
  const { opacity } = useScrollAway();

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
    <section
      ref={spotlightRef}
      onPointerMove={onPointerMove}
      className="trace-lit relative flex min-h-[88svh] items-center overflow-hidden pt-[var(--header-height)]"
    >
      <HeroBackdrop />

      <motion.div className="shell relative py-16 md:py-24" style={{ opacity }}>
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
              <Magnetic>
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-lg"
                >
                  Join the branch
                  <ArrowUpRightIcon className="size-4" />
                </a>
              </Magnetic>
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
      </motion.div>

      <ScrollCue />
    </section>
  );
}
