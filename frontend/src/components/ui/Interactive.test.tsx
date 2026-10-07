/**
 * Pointer-driven interaction.
 *
 * These assert the things that would break something for a real visitor:
 * that a touch does not drag a card around under the finger, that reduced
 * motion removes the behaviour rather than merely shrinking it, and that the
 * back-to-top control only appears when there is something to go back up
 * from and says where the reader is in words.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MotionReact from 'motion/react';

/** jsdom lays nothing out, so an element has to be told how big it is. */
function stubBox(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect;
}

/** Pretend the document is three viewports tall and scrolled to `y`. */
function stubScroll(y: number, height = 3000) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  fireEvent.scroll(window);
}

describe('Tilt', () => {
  afterEach(() => vi.resetModules());

  it('leans toward a mouse', async () => {
    const { Tilt } = await import('./Interactive');
    const { container } = render(
      <Tilt>
        <p>A card</p>
      </Tilt>,
    );

    const tilt = container.firstElementChild as HTMLElement;
    stubBox(tilt);
    fireEvent.pointerMove(tilt, { pointerType: 'mouse', clientX: 10, clientY: 10 });

    // The tilt is a spring, so it arrives over a few frames rather than on
    // the event itself.
    await waitFor(() => expect(tilt.style.transform).toContain('rotate'));
  });

  it('ignores a finger, which is already dragging the page', async () => {
    const { Tilt } = await import('./Interactive');
    const { container } = render(
      <Tilt>
        <p>A card</p>
      </Tilt>,
    );

    const tilt = container.firstElementChild as HTMLElement;
    stubBox(tilt);
    fireEvent.pointerMove(tilt, { pointerType: 'touch', clientX: 10, clientY: 10 });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(tilt.style.transform).not.toContain('rotate');
  });
});

describe('BackToTop', () => {
  afterEach(() => {
    stubScroll(0);
    vi.resetModules();
  });

  it('stays out of the way near the top of the page', async () => {
    const { BackToTop } = await import('./Interactive');
    stubScroll(0);
    render(<BackToTop />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('appears once the page is well under way, and says how far', async () => {
    const { BackToTop } = await import('./Interactive');
    render(<BackToTop />);
    stubScroll(1500);

    const button = await screen.findByRole('button');
    expect(button).toHaveAccessibleName(/75% of the page read/i);
  });
});

describe('under reduced motion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('motion/react', async (importOriginal) => ({
      ...(await importOriginal<typeof MotionReact>()),
      useReducedMotion: () => true,
    }));
  });

  afterEach(() => {
    vi.doUnmock('motion/react');
    vi.resetModules();
  });

  it('a tilt is a plain wrapper that never transforms', async () => {
    const { Tilt } = await import('./Interactive');
    const { container } = render(
      <Tilt>
        <p>A card</p>
      </Tilt>,
    );

    const tilt = container.firstElementChild as HTMLElement;
    stubBox(tilt);
    fireEvent.pointerMove(tilt, { pointerType: 'mouse', clientX: 10, clientY: 10 });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(tilt.style.transform).toBe('');
    expect(screen.getByText('A card')).toBeInTheDocument();
  });

  it('a magnetic control never moves', async () => {
    const { Magnetic } = await import('./Interactive');
    const { container } = render(
      <Magnetic>
        <button type="button">Join</button>
      </Magnetic>,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    stubBox(wrapper);
    fireEvent.pointerMove(wrapper, { pointerType: 'mouse', clientX: 10, clientY: 10 });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(wrapper.style.transform).toBe('');
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });
});
