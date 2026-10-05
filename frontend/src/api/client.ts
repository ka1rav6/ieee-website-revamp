/**
 * The single place the frontend talks to the API.
 *
 * Every request goes through `request()`, so error shapes, the admin token
 * and query serialisation are handled once rather than in each component.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/** Empty in production: the API is served from the same origin as the page. */
export const API_BASE = RAW_BASE.replace(/\/$/, '');

const TOKEN_STORAGE_KEY = 'ieee-admin-token';

/**
 * An error carrying what the UI needs to show: a readable message, the
 * status, and per-field messages when the backend rejected a form.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** True when the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/* --- Token storage ------------------------------------------------------ */

/**
 * The admin token lives in sessionStorage, not localStorage: it should not
 * outlive the browser session, and it is never written into a cookie, so it
 * cannot be sent along with a cross-site request.
 */
export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      // Private browsing and blocked site data both throw here.
      return null;
    }
  },
  set(token: string): void {
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // Not fatal: the session simply will not survive a reload.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

/** Notified when the server rejects the stored token, so the UI can sign out. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/* --- Request ------------------------------------------------------------ */

export type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_BASE}/api/v1${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Skip absent values so an unset filter does not become "?tag=undefined".
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `${url}?${serialised}` : url;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Send the admin token. Required for anything under /admin. */
  auth?: boolean;
  signal?: AbortSignal;
  /** For uploads, where the browser must set the multipart boundary. */
  formData?: FormData;
}

interface ErrorPayload {
  detail?: string;
  fields?: Record<string, string>;
}

async function readError(response: Response): Promise<ApiError> {
  let detail = `Request failed (${response.status})`;
  let fields: Record<string, string> = {};

  try {
    const payload = (await response.json()) as ErrorPayload;
    if (typeof payload.detail === 'string') detail = payload.detail;
    if (payload.fields) fields = payload.fields;
  } catch {
    // A non-JSON error body (a proxy's HTML error page, say) leaves the
    // generic message above in place.
  }

  const retryAfter = response.headers.get('Retry-After');
  return new ApiError(
    detail,
    response.status,
    fields,
    retryAfter ? Number.parseInt(retryAfter, 10) : null,
  );
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = false, signal, formData } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = tokenStore.get();
    if (!token) {
      throw new ApiError('Your session has ended. Please sign in again.', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (error) {
    // Rethrow a deliberate cancellation untouched so callers can ignore it.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (!response.ok) {
    const apiError = await readError(response);
    // An expired or revoked token must drop the session rather than leaving
    // the dashboard in a half-authenticated state.
    if (apiError.isUnauthorized && auth) {
      tokenStore.clear();
      onUnauthorized?.();
    }
    throw apiError;
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Resolve a media path from the API into something the browser can load. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:)?\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
