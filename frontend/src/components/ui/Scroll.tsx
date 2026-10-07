/**
 * Scroll-linked presentation: layers that move with the page, and text that
 * comes up to full strength as it is read.
 *
 * Everything here is a function of scroll position rather than of elapsed
 * time, which is what keeps it feeling attached to the page. The hooks doing
 * the work are in `useScrollMotion`.
 */

import { Fragment, useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useParallax } from '@/hooks/useScrollMotion';
import type { ReactNode } from 'react';

/**
 * A decorative layer that lags behind the page as it scrolls.
 *
 * Always `aria-hidden`: parallax is for backdrops, and anything a visitor
 * needs to read should not be moving independently of the text around it.
 */
export function Parallax({
  children,
  distance = 60,
  className,
}: {
  children: ReactNode;
  distance?: number;
  className?: string;
}) {
  const { ref, y } = useParallax<HTMLDivElement>(distance);

  return (
    <motion.div ref={ref} style={{ y }} className={className} aria-hidden="true">
      {children}
    </motion.div>
  );
}

/** One word of a `WordsReveal`, lit by the container's scroll progress. */
function Word({
  children,
  progress,
  start,
  end,
}: {
  children: ReactNode;
  progress: MotionValue<number>;
  start: number;
  end: number;
}) {
  const opacity = useTransform(progress, [start, end], [0.22, 1]);

  // Opacity only. Lighting a long sentence a word at a time means one
  // interpolation per word per frame, and opacity is the one property that
  // stays cheap at that count.
  return (
    <motion.span className="inline-block" style={{ opacity }}>
      {children}
    </motion.span>
  );
}

/**
 * A statement that comes up to full strength word by word as it is scrolled
 * through, like a line being read.
 *
 * Reserved for a single sentence that is the point of its section - used on
 * body copy it would be an affectation, and would make text harder to read
 * rather than easier.
 *
 * The lit version lives in its own component so that under reduced motion
 * `useScroll` is never called at all. Calling it with a target ref that is
 * then never attached - which is what a branch inside one component would
 * do - makes Motion throw on the next frame.
 */
export function WordsReveal({
  text,
  className,
  as: Element = 'p',
}: {
  text: string;
  className?: string;
  /** The tag to render, so a statement can be the section's heading. */
  as?: 'p' | 'h2' | 'h3';
}) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <Element className={className}>{text}</Element>;
  }

  return <LitWords text={text} className={className} as={Element} />;
}

function LitWords({
  text,
  className,
  as: Element,
}: {
  text: string;
  className?: string;
  as: 'p' | 'h2' | 'h3';
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // Starts once the block is well into view and finishes before it leaves,
    // so the sentence is never still resolving as it goes off the top.
    offset: ['start 0.85', 'end 0.6'],
  });

  const words = text.split(' ');
  // Each word's window overlaps its neighbours', which is what makes the
  // light travel along the line instead of stepping word to word. The last
  // word finishes at 0.85 rather than at 1, so the sentence is fully lit
  // while it is still comfortably in view - a heading that only reaches
  // full strength as it leaves the screen would be a legibility bug, not
  // an effect.
  const step = words.length > 0 ? 0.6 / words.length : 0;
  const lightSpan = 0.25;

  return (
    <Element ref={ref as React.Ref<HTMLParagraphElement>} className={className}>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {/* The space sits outside the inline-block, where it cannot be
              collapsed away by the span's own box. */}
          <Word progress={scrollYProgress} start={index * step} end={index * step + lightSpan}>
            {word}
          </Word>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Element>
  );
}
