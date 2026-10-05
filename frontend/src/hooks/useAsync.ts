/**
 * Data fetching with the four states every screen needs: loading, error,
 * empty and loaded. Small on purpose - a query library would be more than
 * this site needs, and these three hooks cover every page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Re-run the request, e.g. from a "Try again" button. */
  reload: () => void;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError('Something went wrong. Please try again.', 0);
}

/**
 * Run an async function when its dependencies change.
 *
 * The request is aborted when dependencies change or the component unmounts,
 * so a slow earlier response can never overwrite a newer one.
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  // Kept in a ref so changing the loader identity between renders does not
  // re-trigger the effect; `deps` is the declared trigger.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(toApiError(caught));
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, error, loading, reload };
}

export interface MutationState {
  submitting: boolean;
  error: ApiError | null;
  /** Field-level messages from the backend, keyed by field name. */
  fieldErrors: Record<string, string>;
  reset: () => void;
}

/**
 * Run a one-off write (submit, delete, publish) and expose its progress.
 *
 * Field errors are surfaced separately so forms can place each message
 * beside the input it belongs to.
 */
export function useMutation<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): [(...args: Args) => Promise<Result | null>, MutationState] {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: Args): Promise<Result | null> => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      if (mounted.current) setSubmitting(false);
      return result;
    } catch (caught) {
      const apiError = toApiError(caught);
      if (mounted.current) {
        setError(apiError);
        setSubmitting(false);
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return [run, { submitting, error, fieldErrors: error?.fields ?? {}, reset }];
}

/**
 * Delay a fast-changing value, so a search box queries the API once the
 * visitor stops typing rather than on every keystroke.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
