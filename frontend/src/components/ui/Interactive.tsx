/**
 * Pointer-driven interaction.
 *
 * Each of these responds to where the pointer is rather than to a click, so
 * the page acknowledges the visitor before they commit to anything. All of
 * them are inert under reduced motion and on touch, where there is no hover
 * to respond to and a transform under a finger just fights the scroll.
 *
 * Springs - not transitions - are what make these feel physical: the element
 * chases the pointer and settles, and a sudden change of direction is caught
 * rather than snapped.
 */

import { useCallback, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring } from 'motion/react';
import { useScrollProgress } from '@/hooks/useInteraction';
import { cx } from '@/utils/format';
import { ArrowUpIcon } from './Icons';
import type { PointerEvent, ReactNode } from 'react';

const CHASE = { stiffness: 260, damping: 26, mass: 0.6 } as const;
const SETTLE = { stiffness: 170, damping: 20, mass: 0.7 } as const;

/**
 * Tilt a card toward the pointer.
 *
 * The perspective comes from an ancestor carrying `.tilt-scene`, so a grid
 * of these all tilt in one optical space instead of each inventing its own
 * vanishing point.
 */
export function Tilt({
  children,
  className,
  /** Maximum rotation in degrees. Past about 8 the text starts to smear. */
  max = 5,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(0, CHASE);
  const rotateY = useSpring(0, CHASE);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (reducedMotion || event.pointerType === 'touch') return;
      const element = ref.current;
      if (!element) return;

      const bounds = element.getBoundingClientRect();
      const fromCentreX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const fromCentreY = (event.clientY - bounds.top) / bounds.height - 0.5;

      rotateY.set(fromCentreX * max * 2);
      rotateX.set(-fromCentreY * max * 2);
    },
    [max, reducedMotion, rotateX, rotateY],
  );

  const reset = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      // Leaving the card by keyboard must settle it too, or a tabbed-to card
      // can be left holding whatever tilt the pointer last gave it.
      onBlur={reset}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Lean a control a few pixels toward the pointer as it approaches.
 *
 * Deliberately small: the control must still be exactly where it looks like
 * it is when the visitor clicks, so the travel stays well inside the hit
 * area it already had.
 */
export function Magnetic({
  children,
  className,
  strength = 5,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(0, SETTLE);
  const y = useSpring(0, SETTLE);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLSpanElement>) => {
      if (reducedMotion || event.pointerType === 'touch') return;
      const element = ref.current;
      if (!element) return;

      const bounds = element.getBoundingClientRect();
      x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * strength * 2);
      y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * strength * 2);
    },
    [reducedMotion, strength, x, y],
  );

  const reset = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  if (reducedMotion) {
    return <span className={cx('inline-flex', className)}>{children}</span>;
  }

  return (
    <motion.span
      ref={ref}
      className={cx('inline-flex', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onBlur={reset}
      style={{ x, y }}
    >
      {children}
    </motion.span>
  );
}

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Return to the top, with a ring showing how far down the page is.
 *
 * Appears only once there is enough page behind the visitor to be worth
 * skipping, and carries the scroll position so it is informative as well as
 * a shortcut. It is a real button, so it works from the keyboard and reports
 * the position to a screen reader as text rather than as a drawing.
 */
export function BackToTop() {
  const progress = useScrollProgress();
  const reducedMotion = useReducedMotion();
  const visible = progress > 0.18;
  const percent = Math.round(progress * 100);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' })
          }
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 12 }}
          transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.2 }}
          className="group fixed right-5 bottom-5 z-40 grid size-11 place-items-center rounded-full border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface-raised)_90%,transparent)] text-muted shadow-[var(--shadow-lifted)] backdrop-blur-md transition-colors duration-200 hover:text-strong md:right-8 md:bottom-8"
          aria-label={`Back to top. ${percent}% of the page read.`}
        >
          <svg
            viewBox="0 0 36 36"
            className="absolute inset-0 size-full -rotate-90"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx="18"
              cy="18"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              // Drawn directly from scroll position: no animation to settle,
              // so the ring can never disagree with where the page is.
              strokeDashoffset={RING_LENGTH * (1 - progress)}
              opacity="0.85"
            />
          </svg>
          <ArrowUpIcon className="relative size-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
