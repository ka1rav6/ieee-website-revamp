/**
 * Test helpers.
 *
 * Components here depend on routing and the settings context, so rendering
 * them bare would throw. `renderWithProviders` supplies the same stack the
 * app does, with settings stubbed so no test needs a live API.
 */

import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { BlogPostSummary, SiteEvent, SiteSettings } from '@/types/api';

/** Stub the settings provider so tests do not hit the network. */
export function stubSiteSettings(values: SiteSettings = {}) {
  vi.doMock('@/hooks/useSiteSettings', () => ({
    SiteSettingsProvider: ({ children }: { children: ReactNode }) => children,
    useSiteSettings: () => ({
      settings: values,
      loading: false,
      text: (key: string, fallback: string) => values[key] ?? fallback,
      link: (key: string) => values[key] || undefined,
    }),
  }));
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entries, for components that read the location. */
  route?: string;
}

export function renderWithProviders(ui: ReactElement, { route = '/', ...options }: Options = {}) {
  return render(ui, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
    ...options,
  });
}

/* --- Fixtures ----------------------------------------------------------- */

export function makePost(overrides: Partial<BlogPostSummary> = {}): BlogPostSummary {
  return {
    slug: 'a-post',
    title: 'An Introduction to Web3',
    excerpt: 'Web3 is the latest iteration of the internet.',
    cover_image: null,
    cover_image_alt: null,
    author_name: 'Sameer Gupta',
    author_subtitle: 'B.Tech.',
    author_image: null,
    category: { slug: 'tech-affairs', name: 'Tech Affairs', description: null, post_count: 3 },
    tags: [],
    is_featured: false,
    published_at: '2022-08-23',
    reading_minutes: 4,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<SiteEvent> = {}): SiteEvent {
  return {
    slug: 'an-event',
    title: 'Slash',
    description: 'A cryptic tech hunt.',
    poster: null,
    event_date: '2026-03-13',
    location: null,
    category: null,
    registration_url: null,
    ieee_day_year: null,
    is_featured: false,
    ...overrides,
  };
}
