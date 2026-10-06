/**
 * The API client: error shapes, the admin token, and query serialisation.
 *
 * These are what every screen's error handling depends on, so they are
 * tested directly rather than through a component.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, mediaUrl, request, setUnauthorizedHandler, tokenStore } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('ApiError', () => {
  it('classifies statuses', () => {
    expect(new ApiError('x', 401).isUnauthorized).toBe(true);
    expect(new ApiError('x', 404).isNotFound).toBe(true);
    expect(new ApiError('x', 429).isRateLimited).toBe(true);
    expect(new ApiError('x', 0).isNetworkError).toBe(true);
    expect(new ApiError('x', 500).isNetworkError).toBe(false);
  });
});

describe('tokenStore', () => {
  afterEach(() => tokenStore.clear());

  it('round-trips a token', () => {
    tokenStore.set('abc');

    expect(tokenStore.get()).toBe('abc');
  });

  it('returns null once cleared', () => {
    tokenStore.set('abc');
    tokenStore.clear();

    expect(tokenStore.get()).toBeNull();
  });
});

describe('request', () => {
  beforeEach(() => {
    tokenStore.clear();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' })));

    await expect(request('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('serialises query parameters and omits empty ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await request('/blogs', {
      query: { page: 2, category: 'tech', tag: null, search: undefined, featured: false, q: '' },
    });

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('category=tech');
    expect(url).toContain('featured=false');
    // An unset filter must not reach the API as the string "null".
    expect(url).not.toContain('tag=');
    expect(url).not.toContain('search=');
    expect(url).not.toContain('q=');
  });

  it('turns a failure body into an ApiError with field messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { detail: 'Please correct the highlighted fields.', fields: { email: 'Invalid' } },
            { status: 422 },
          ),
        ),
    );

    await expect(request('/contact', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      message: 'Please correct the highlighted fields.',
      fields: { email: 'Invalid' },
    });
  });

  it('reports a dropped connection as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await request('/health').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
  });

  it('survives an error body that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
    );

    await expect(request('/health')).rejects.toMatchObject({ status: 502 });
  });

  it('sends the admin token on authenticated requests', async () => {
    tokenStore.set('secret-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await request('/admin/team', { auth: true });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('fails an authenticated request without a token, without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/admin/team', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the session and notifies when the server rejects the token', async () => {
    tokenStore.set('stale-token');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'Session expired' }, { status: 401 })),
    );

    await expect(request('/admin/team', { auth: true })).rejects.toBeInstanceOf(ApiError);

    expect(tokenStore.get()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not clear the session for a 401 on a public endpoint', async () => {
    tokenStore.set('good-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'nope' }, { status: 401 })),
    );

    await expect(request('/blogs')).rejects.toBeInstanceOf(ApiError);

    expect(tokenStore.get()).toBe('good-token');
  });

  it('reads Retry-After from a throttled response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '120' },
        }),
      ),
    );

    const error = (await request('/contact', { method: 'POST' }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(120);
  });

  it('lets an abort propagate untouched so callers can ignore it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    await expect(request('/blogs')).rejects.toThrow(DOMException);
  });
});

describe('mediaUrl', () => {
  it('passes absolute URLs through', () => {
    expect(mediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });

  it('keeps site-relative paths rooted', () => {
    expect(mediaUrl('/legacy/people/a.webp')).toBe('/legacy/people/a.webp');
    expect(mediaUrl('legacy/people/a.webp')).toBe('/legacy/people/a.webp');
  });

  it('returns undefined for a missing path', () => {
    expect(mediaUrl(null)).toBeUndefined();
    expect(mediaUrl('')).toBeUndefined();
  });
});
