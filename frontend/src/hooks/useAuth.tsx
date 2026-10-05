/**
 * Admin session state.
 *
 * The token itself lives in the API client's sessionStorage wrapper; this
 * context only tracks who is signed in, so no component ever reads or passes
 * the token around. A 401 from any request clears the session through the
 * client's unauthorized handler, which means an expired token always lands
 * the admin on the sign-in screen rather than on a broken dashboard.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setUnauthorizedHandler, tokenStore } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { AdminProfile } from '@/types/api';

interface AuthContextValue {
  admin: AdminProfile | null;
  /** True while the stored token is being verified on first load. */
  initialising: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [initialising, setInitialising] = useState(() => tokenStore.get() !== null);

  // Verify a token left over from a page reload before trusting it.
  useEffect(() => {
    if (!tokenStore.get()) {
      setInitialising(false);
      return;
    }

    let active = true;
    authApi
      .me()
      .then((profile) => {
        if (active) setAdmin(profile);
      })
      .catch(() => {
        // The client already cleared an invalid token.
        if (active) setAdmin(null);
      })
      .finally(() => {
        if (active) setInitialising(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAdmin(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const token = await authApi.login(email, password);
    tokenStore.set(token.access_token);
    setAdmin(await authApi.me());
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Signing out locally must succeed even if the request fails.
    }
    tokenStore.clear();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ admin, initialising, signIn, signOut }),
    [admin, initialising, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
