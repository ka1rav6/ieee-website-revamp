/**
 * Changing the password with a mistyped current password.
 *
 * The API answers that with a 422 on the field. It used to be a 401, which
 * the client reads as an expired session - the admin was signed out and
 * never saw why.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { renderWithProviders } from '@/test/utils';
import AdminSettingsPage from './AdminSettingsPage';

const signOut = vi.fn();
const changePassword = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut }),
}));

vi.mock('@/api/endpoints', () => ({
  adminApi: {
    settings: {
      read: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
    },
  },
  authApi: {
    changePassword: (...args: unknown[]) => changePassword(...args),
  },
}));

describe('AdminSettingsPage password change', () => {
  it('shows a wrong current password on the field and keeps the session', async () => {
    changePassword.mockRejectedValue(
      new ApiError('Your current password is incorrect.', 422, {
        current_password: 'This is not your current password.',
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminSettingsPage />);

    await user.type(await screen.findByLabelText('Current password'), 'not-it-at-all');
    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('This is not your current password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true');
    expect(signOut).not.toHaveBeenCalled();
  });
});
