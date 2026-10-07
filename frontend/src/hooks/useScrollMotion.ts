/**
 * Scroll-linked motion.
 *
 * These differ from the entrance animations in `Reveal`: an entrance is
 * triggered once when an element appears, whereas everything here is a
 * continuous function of scroll position. Nothing runs on a timer, so there
 * is no animation to fall out of step with the page, and the moment the
 * visitor stops scrolling the movement stops too.
 *
 * Every hook returns a plain `0` under reduced motion, which Motion accepts
 * in place of a motion value - the element simply never moves.
 */

import { useRef } from 'react';
import {
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';

/**
 * Spring used to smooth raw scroll progress.
 *
 * Scroll events arrive unevenly - a trackpad flick, a mouse wheel's discrete
 * notches, a touch fling - and mapping them straight onto a transform shows
 * every one of those steps. Passing progress through a light spring first is
 * what turns it into movement that reads as smooth, and it costs one
 * interpolation per frame.
 */
const SMOOTH = { stiffness: 140, damping: 32, mass: 0.35, restDelta: 0.0005 } as const;

/**
 * Progress from 0 to 1 as an element travels through the viewport.
 *
 * 0 is the element's top edge entering at the bottom of the screen, 1 is its
 * bottom edge leaving at the top.
 */
export function useViewProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  return { ref, progress: scrollYProgress };
}

/**
 * Vertical parallax for a decorative layer.
 *
 * `distance` is how far the layer travels, in pixels, across the whole of
 * its pass through the viewport: positive values make it lag behind the
 * page, which is what reads as "further away".
 */
export function useParallax<T extends HTMLElement>(distance = 60) {
  const reducedMotion = useReducedMotion();
  const { ref, progress } = useViewProgress<T>();
  const smooth = useSpring(progress, SMOOTH);
  const travel = useTransform(smooth, [0, 1], [distance, -distance]);

  return { ref, y: reducedMotion ? 0 : travel };
}

/**
 * Parallax driven by the window rather than by an element.
 *
 * For a layer that is already at the top of the document - the hero's
 * backdrop - where an element-relative measurement would start mid-way
 * through its own range on first paint.
 */
export function usePageParallax(distance = 120): MotionValue<number> | number {
  const reducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const smooth = useSpring(scrollY, SMOOTH);
  // Measured against the viewport height, so the effect is the same on a
  // laptop and on a phone.
  const travel = useTransform(smooth, (value) => {
    const viewport = typeof window === 'undefined' ? 1 : window.innerHeight || 1;
    return Math.min(1, value / viewport) * distance;
  });

  return reducedMotion ? 0 : travel;
}

/**
 * Scale and fade a hero as it is scrolled away.
 *
 * Returns values that are inert under reduced motion, where the hero simply
 * scrolls off like any other block.
 */
export function useScrollAway(fadeOverVh = 0.75) {
  const reducedMotion = useReducedMotion();
  const { scrollY } = useScroll();

  const opacity = useTransform(scrollY, (value) => {
    const viewport = typeof window === 'undefined' ? 1 : window.innerHeight || 1;
    return Math.max(0, 1 - value / (viewport * fadeOverVh));
  });

  return reducedMotion ? { opacity: 1 } : { opacity };
}
