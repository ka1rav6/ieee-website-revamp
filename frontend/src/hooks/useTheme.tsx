/**
 * Light/dark theme with three states: system (the default), light and dark.
 *
 * An explicit choice is stamped onto the root element as `data-theme`, which
 * the stylesheet uses to override the system preference in both directions.
 * "System" stamps nothing, so `prefers-color-scheme` alone decides.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'ieee-theme';

interface ThemeContextValue {
  choice: ThemeChoice;
  /** What is actually on screen, with "system" resolved. */
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
  /** Cycle light -> dark -> light, for the header toggle. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Blocked site data: fall through to the system preference.
  }
  return 'system';
}

function systemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(systemPreference);

  // Track the system preference so "system" stays live and the toggle's icon
  // reflects what is actually showing.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = choice === 'system' ? systemTheme : choice;

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', choice);
    }
  }, [choice]);

  // Keep the browser UI (address bar, form controls) in step with the page.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#060d15' : '#f6f8fb');
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not fatal: the choice simply will not persist across reloads.
    }
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setChoice]);

  const value = useMemo(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}
