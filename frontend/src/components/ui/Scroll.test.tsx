/**
 * Word-by-word reveal.
 *
 * The thing worth testing here is not the animation - it is that the
 * sentence survives being taken apart and put back together. Splitting text
 * into one inline-block per word is exactly how a headline ends up reading
 * "Technologyfor humanity", so these assert the text and its spacing, in
 * both the animated and the reduced-motion path.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as MotionReact from 'motion/react';

const STATEMENT = 'IEEE-IIITD is the student branch of the largest technical organisation.';

describe('WordsReveal', () => {
  it('renders the whole sentence, with its spacing intact', async () => {
    const { WordsReveal } = await import('./Scroll');
    const { container } = render(<WordsReveal text={STATEMENT} />);

    expect(container.textContent).toBe(STATEMENT);
  });

  it('splits the sentence into one element per word', async () => {
    const { WordsReveal } = await import('./Scroll');
    const { container } = render(<WordsReveal text={STATEMENT} />);

    expect(container.querySelectorAll('span')).toHaveLength(STATEMENT.split(' ').length);
  });

  it('renders as the requested heading, so the page outline is unaffected', async () => {
    const { WordsReveal } = await import('./Scroll');
    render(<WordsReveal as="h2" text={STATEMENT} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(STATEMENT);
  });

  it('renders plain text under reduced motion', async () => {
    vi.resetModules();
    vi.doMock('motion/react', async (importOriginal) => ({
      ...(await importOriginal<typeof MotionReact>()),
      useReducedMotion: () => true,
    }));

    const { WordsReveal } = await import('./Scroll');
    const { container } = render(<WordsReveal as="h2" text={STATEMENT} />);

    expect(container.textContent).toBe(STATEMENT);
    // No per-word elements at all: nothing to light, nothing to animate.
    expect(container.querySelectorAll('span')).toHaveLength(0);

    vi.doUnmock('motion/react');
    vi.resetModules();
  });
});
