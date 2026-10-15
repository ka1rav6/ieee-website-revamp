/**
 * The header's tone follows the band the page opens on.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from '@/components/ui/Section';
import { ThemeProvider } from '@/hooks/useTheme';
import { PublicLayout } from './PublicLayout';

vi.mock('@/hooks/useSiteSettings', () => ({
  SiteSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useSiteSettings: () => ({
    settings: {},
    loading: false,
    text: (_key: string, fallback: string) => fallback,
    link: () => undefined,
  }),
}));

function renderAt(path: string) {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<p>A light hero</p>} />
            <Route path="/about" element={<PageHeader title="About the branch" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
  return screen.getByRole('navigation', { name: 'Primary' }).closest('header')!;
}

describe('PublicLayout header tone', () => {
  it('uses light text over a page that opens on the navy page header', () => {
    const header = renderAt('/about');

    expect(header).toHaveClass('text-on-contrast');
    expect(header).not.toHaveClass('text-ink');
  });

  it('keeps ink text over a light hero', () => {
    const header = renderAt('/');

    expect(header).toHaveClass('text-ink');
    expect(header).not.toHaveClass('text-on-contrast');
  });
});
