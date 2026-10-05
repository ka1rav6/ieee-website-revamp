import '@testing-library/jest-dom/vitest';

// jsdom implements neither matchMedia nor IntersectionObserver, both of which
// the theme, reveal and count-up code rely on. Stubbing them here keeps the
// stubs out of individual tests.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!('IntersectionObserver' in window)) {
  class StubIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (window as unknown as Record<string, unknown>).IntersectionObserver = StubIntersectionObserver;
}
