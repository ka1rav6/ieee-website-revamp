/**
 * Lets a page tell the fixed header that it opens on a dark band.
 *
 * The header is transparent until the page scrolls, so its text sits
 * directly on whatever the page starts with. Interior pages open on the navy
 * `PageHeader`, where the header's normal ink text is about 1.3:1 - the nav
 * all but disappears. A page that mounts a dark hero registers it here and
 * the header switches to its light-on-dark treatment while it is over it.
 *
 * A count rather than a flag, so the brief overlap of two routes during a
 * page transition cannot leave the header in the wrong tone.
 */

import { createContext, useContext, useLayoutEffect } from 'react';

interface HeaderTone {
  darkHeroes: number;
  /** Register a dark hero; returns the function that unregisters it. */
  register: () => () => void;
}

export const HeaderToneContext = createContext<HeaderTone>({
  darkHeroes: 0,
  register: () => () => undefined,
});

/** Call from a component that renders a dark band at the very top of a page. */
export function useDarkHero(): void {
  const { register } = useContext(HeaderToneContext);
  // A layout effect, so the header has the right tone on the first paint
  // rather than flashing dark text for a frame.
  useLayoutEffect(() => register(), [register]);
}

/** Whether the current page opens on a dark band. */
export function useOverDarkHero(): boolean {
  return useContext(HeaderToneContext).darkHeroes > 0;
}
