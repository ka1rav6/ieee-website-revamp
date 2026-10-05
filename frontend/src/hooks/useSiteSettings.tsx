/**
 * Editable site copy, loaded once and shared by every page.
 *
 * Fetching this in one place means the header, footer and page bodies agree
 * on the branch's wording, and a change in the admin dashboard shows up
 * everywhere on the next load. Each lookup takes a fallback, so the layout
 * is never broken by a key the admin has not filled in.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { publicApi } from '@/api/endpoints';
import { useAsync } from './useAsync';
import type { SiteSettings } from '@/types/api';

interface SiteSettingsContextValue {
  settings: SiteSettings;
  loading: boolean;
  /** Read a setting, falling back to `fallback` when it is missing or blank. */
  text: (key: string, fallback: string) => string;
  /** Read a link, returning undefined when unset so it can be omitted. */
  link: (key: string) => string | undefined;
}

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useAsync((signal) => publicApi.settings(signal), []);

  const value = useMemo<SiteSettingsContextValue>(() => {
    const settings = data ?? {};
    return {
      settings,
      loading,
      text: (key, fallback) => {
        const raw = settings[key];
        return raw && raw.trim() ? raw : fallback;
      },
      link: (key) => {
        const raw = settings[key];
        return raw && raw.trim() ? raw : undefined;
      },
    };
  }, [data, loading]);

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsContextValue {
  const context = useContext(SiteSettingsContext);
  if (!context) {
    throw new Error('useSiteSettings must be used inside a SiteSettingsProvider');
  }
  return context;
}
