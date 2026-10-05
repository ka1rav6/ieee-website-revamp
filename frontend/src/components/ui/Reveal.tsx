/**
 * Scroll-triggered entrance animations.
 *
 * `whileInView` with `once` means an element animates the first time it is
 * seen and then stays put, so scrolling back up does not replay everything.
 * Under reduced motion the children render in their final position with no
 * transform at all.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSETS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 24 },
  down: { x: 0, y: -24 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
  none: { x: 0, y: 0 },
};

interface RevealProps {
  children: ReactNode;
  /** Which way the element travels in from. */
  direction?: Direction;
  /** Seconds to wait, for staggering siblings. */
  delay?: number;
  duration?: number;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li' | 'header' | 'aside';
}

export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.55,
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
      initial={{ opacity: 0, x: offset.x, y: offset.y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      // A negative bottom margin starts the animation slightly before the
      // element reaches the viewport edge, so it is already settling by the
      // time it is properly in view.
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
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
  as?: 'div' | 'ul' | 'ol' | 'section';
}

/**
 * Animate a list's children in sequence.
 *
 * Children must be `StaggerItem`s; the parent orchestrates the timing so each
 * item does not need its own delay calculation.
 */
export function Stagger({ children, className, step = 0.07, as = 'div' }: StaggerProps) {
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
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: step } },
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
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </Component>
  );
}
