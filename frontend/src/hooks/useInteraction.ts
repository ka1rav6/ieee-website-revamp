/**
 * Small interaction primitives: motion preference, pointer spotlight,
 * count-up and scroll progress.
 *
 * Each one is cheap and degrades to a sensible static state, so a visitor
 * who has asked for reduced motion sees a complete page rather than a
 * half-animated one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether the visitor has asked the operating system to reduce motion.
 *
 * Updates live, because the preference can be changed while the page is open.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Track the pointer within an element as CSS custom properties.
 *
 * Writing to custom properties lets the highlight itself be pure CSS, which
 * keeps this off the main thread's paint path. Disabled under reduced motion
 * and never attached on touch-only devices, where there is no hover.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const reducedMotion = useReducedMotion();

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (reducedMotion || event.pointerType === 'touch') return;
      const element = ref.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      element.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
      element.style.setProperty('--my', `${event.clientY - bounds.top}px`);
    },
    [reducedMotion],
  );

  return { ref, onPointerMove };
}

/**
 * Count from zero to `target` once the element is scrolled into view.
 *
 * Returns the current value and a ref to attach. The final value is shown
 * immediately under reduced motion, since the number is the information and
 * the animation is only flourish.
 */
export function useCountUp(target: number, durationMs = 1400) {
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }

    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setValue(target);
      return;
    }

    let frame = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || hasRun.current) return;
        hasRun.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          // Ease out so the number decelerates into its final value.
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(target * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target, durationMs, reducedMotion]);

  return { ref, value };
}

/**
 * How far the window has scrolled through the document, from 0 to 1.
 *
 * Used for the reading-progress bar on an article.
 */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
      frame = 0;
    };

    // Coalesce scroll events into one measurement per frame.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

/** True once the page has scrolled past `threshold` pixels. */
export function useScrolledPast(threshold = 16): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      setPast(window.scrollY > threshold);
      frame = 0;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return past;
}

/** Lock body scrolling while a mobile menu or modal is open. */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

/** Call `handler` when Escape is pressed. For menus and modals. */
export function useEscapeKey(handler: () => void, active = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handlerRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

/** Media query as a live boolean. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
