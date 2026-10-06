/**
 * The administrator sign-in screen.
 *
 * Deliberately plain: one account, two fields, and error messages that never
 * reveal whether an address exists. The backend throttles attempts per IP;
 * this just reports what it says.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMutation } from '@/hooks/useAsync';
import { Seo } from '@/components/Seo';
import { BrandMark } from '@/components/layout/Brand';
import { FormError } from '@/components/ui/States';
import { EyeIcon, EyeOffIcon } from '@/components/ui/Icons';

export default function AdminLoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submit, { submitting, error }] = useMutation(signIn);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await submit(email.trim(), password);
    },
    [email, password, submit],
  );

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-16">
      <Seo title="Sign in" noIndex />

      <div className="grid-field absolute inset-0" aria-hidden="true" />
      <div className="glow top-0 left-1/3 size-96 bg-[var(--glow-primary)]" aria-hidden="true" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-12" />
          <div>
            <h1 className="font-display text-2xl font-bold">Dashboard</h1>
            <p className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted uppercase">
              IEEE IIIT Delhi
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="card space-y-5 p-6">
          <div>
            <label htmlFor="admin-email" className="field-label">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              name="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="field-label">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded text-faint transition-colors hover:text-strong"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>

          <FormError error={error} />

          {error?.isRateLimited && error.retryAfterSeconds && (
            <p className="text-sm text-muted">
              Try again in about {Math.ceil(error.retryAfterSeconds / 60)} minute
              {error.retryAfterSeconds > 60 ? 's' : ''}.
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-faint">
          This site has a single administrator account. Credentials are set through environment
          variables and <code className="font-mono">just admin</code>.
        </p>
      </div>
    </div>
  );
}
