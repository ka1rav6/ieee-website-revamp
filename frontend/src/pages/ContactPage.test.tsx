/**
 * Contact form behaviour: validation, the two modes, submission and errors.
 *
 * This is the one place a visitor sends us something, so it gets the most
 * thorough interaction coverage in the frontend suite.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';

// The settings provider would otherwise fetch on mount.
vi.mock('@/hooks/useSiteSettings', () => ({
  SiteSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useSiteSettings: () => ({
    settings: {},
    loading: false,
    text: (_key: string, fallback: string) => fallback,
    link: () => undefined,
  }),
}));

const submitContact = vi.fn();
vi.mock('@/api/endpoints', () => ({
  publicApi: {
    submitContact: (...args: unknown[]) => submitContact(...args),
  },
}));

const VALID_MESSAGE = 'We would like to run a workshop with your branch next semester.';

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), 'Priya Sharma');
  await user.type(screen.getByLabelText(/email address/i), 'priya@example.com');
  await user.type(screen.getByLabelText(/^message$/i), VALID_MESSAGE);
}

describe('ContactPage', () => {
  let ContactPage: typeof import('./ContactPage').default;

  beforeEach(async () => {
    submitContact.mockReset().mockResolvedValue({ id: 1, created_at: '2026-01-01T00:00:00Z' });
    ContactPage = (await import('./ContactPage')).default;
  });

  afterEach(() => vi.clearAllMocks());

  it('renders both ways of getting in touch', () => {
    renderWithProviders(<ContactPage />);

    expect(screen.getByRole('tab', { name: /contact us/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /collaborate with us/i })).toBeInTheDocument();
  });

  it('submits a valid message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(submitContact).toHaveBeenCalledOnce());
    expect(submitContact).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        message: VALID_MESSAGE,
        inquiry_type: 'general',
      }),
    );
  });

  it('confirms once the message is sent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/message sent/i)).toBeInTheDocument();
  });

  it('rejects an invalid email without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.type(screen.getByLabelText(/your name/i), 'Priya Sharma');
    await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^message$/i), VALID_MESSAGE);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(submitContact).not.toHaveBeenCalled();
  });

  it('rejects a message that is too short', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.type(screen.getByLabelText(/your name/i), 'Priya Sharma');
    await user.type(screen.getByLabelText(/email address/i), 'priya@example.com');
    await user.type(screen.getByLabelText(/^message$/i), 'too short');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/at least 20 characters/i)).toBeInTheDocument();
    expect(submitContact).not.toHaveBeenCalled();
  });

  it('marks an invalid field for assistive technology', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.type(screen.getByLabelText(/email address/i), 'nope');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('clears a field error as soon as the sender starts correcting it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.type(screen.getByLabelText(/email address/i), 'nope');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email address/i), '@example.com');

    await waitFor(() => expect(screen.queryByText(/valid email address/i)).not.toBeInTheDocument());
  });

  it('requires an organisation when collaborating', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.click(screen.getByRole('tab', { name: /collaborate with us/i }));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/which organisation/i)).toBeInTheDocument();
    expect(submitContact).not.toHaveBeenCalled();
  });

  it('offers collaboration enquiry types in the collaborate tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.click(screen.getByRole('tab', { name: /collaborate with us/i }));

    const select = screen.getByLabelText(/what is this about/i) as HTMLSelectElement;
    const options = [...select.options].map((option) => option.value);
    expect(options).toContain('industry_collaboration');
    expect(options).not.toContain('membership');
  });

  it('keeps the form on screen when the server rejects the submission', async () => {
    const { ApiError } = await import('@/api/client');
    submitContact.mockRejectedValue(new ApiError('Too many requests', 429));

    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i);
    expect(screen.queryByText(/message sent/i)).not.toBeInTheDocument();
  });

  it('places a server field error beside the right input', async () => {
    const { ApiError } = await import('@/api/client');
    submitContact.mockRejectedValue(
      new ApiError('Please correct the highlighted fields.', 422, {
        email: 'That address is not deliverable',
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/not deliverable/i)).toBeInTheDocument();
  });
});
