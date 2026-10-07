/**
 * Scroll-triggered entrance animations.
 *
 * `whileInView` with `once` means an element animates the first time it is
 * seen and then stays put, so scrolling back up does not replay everything.
 *
 * Three things make these read as smooth rather than merely animated:
 *
 *  - the transform runs on a spring rather than a fixed curve, so it settles
 *    naturally and can be interrupted part-way without snapping;
 *  - a small blur resolves alongside the movement, which reads as something
 *    coming into focus instead of sliding into place;
 *  - opacity and blur finish slightly before the movement does, so the
 *    element is readable while the last few pixels settle.
 *
 * Under reduced motion the children render in their final position with no
 * transform, no blur and no transition at all.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSETS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 28 },
  down: { x: 0, y: -28 },
  left: { x: 28, y: 0 },
  right: { x: -28, y: 0 },
  none: { x: 0, y: 0 },
};

/** How far out of focus an element starts, in pixels of blur. */
const BLUR = 6;

/**
 * Timing shared by every entrance on the site.
 *
 * The spring is tuned by `visualDuration` - the time to visually arrive -
 * rather than by stiffness, so a change here reads as a change in pace and
 * not as a change in physics.
 */
function entranceTransition(duration: number, delay: number) {
  return {
    default: { type: 'spring' as const, visualDuration: duration, bounce: 0.14, delay },
    opacity: { duration: duration * 0.75, ease: [0.16, 1, 0.3, 1] as const, delay },
    filter: { duration: duration * 0.85, ease: [0.16, 1, 0.3, 1] as const, delay },
  };
}

interface RevealProps {
  children: ReactNode;
  /** Which way the element travels in from. */
  direction?: Direction;
  /** Seconds to wait, for staggering siblings. */
  delay?: number;
  /** Seconds to visually arrive. */
  duration?: number;
  /**
   * Resolve a blur as the element arrives. Worth turning off for a block
   * that is mostly a large image, where the blur is expensive and the
   * movement alone is enough.
   */
  blur?: boolean;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li' | 'header' | 'aside';
}

export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  blur = true,
  className,
  as = 'div',
}: RevealProps) {
  const reducedMotion = useReducedMotion();
  const offset = OFFSETS[direction];
  const Component = motion[as];

  if (reducedMotion) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
        filter: blur ? `blur(${BLUR}px)` : 'blur(0px)',
      }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
      // A negative bottom margin starts the animation slightly before the
      // element reaches the viewport edge, so it is already settling by the
      // time it is properly in view. `amount` keeps a tall block from
      // waiting until its whole height is on screen.
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -80px 0px' }}
      transition={entranceTransition(duration, delay)}
    >
      {children}
    </Component>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Seconds between each child's entrance. */
  step?: number;
  /** Seconds before the first child starts. */
  delay?: number;
  as?: 'div' | 'ul' | 'ol' | 'section';
}

/**
 * Animate a list's children in sequence.
 *
 * Children must be `StaggerItem`s; the parent orchestrates the timing so each
 * item does not need its own delay calculation.
 */
export function Stagger({ children, className, step = 0.06, delay = 0, as = 'div' }: StaggerProps) {
  const reducedMotion = useReducedMotion();
  const Component = motion[as];

  if (reducedMotion) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1, margin: '0px 0px -60px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: step, delayChildren: delay } },
      }}
    >
      {children}
    </Component>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
}

export function StaggerItem({ children, className, as = 'div' }: StaggerItemProps) {
  const reducedMotion = useReducedMotion();
  const Component = motion[as];

  if (reducedMotion) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      variants={{
        // The slight scale is what makes a grid of cards look like it is
        // settling into place rather than marching up from below.
        hidden: { opacity: 0, y: 22, scale: 0.985, filter: `blur(${BLUR}px)` },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: entranceTransition(0.55, 0),
        },
      }}
    >
      {children}
    </Component>
  );
}
