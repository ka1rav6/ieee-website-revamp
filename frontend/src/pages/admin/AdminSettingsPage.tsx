/**
 * Site settings and the admin's own password.
 *
 * Settings are a flat key/value store, so this screen groups the known keys
 * into something readable while still letting an unrecognised key through -
 * a new one added in content/site.yaml shows up here rather than vanishing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, authApi } from '@/api/endpoints';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { cx } from '@/utils/format';
import {
  AdminHeader,
  ContentFileNote,
  Labelled,
  MutationError,
  SavedToast,
} from './components/AdminUi';
import { ErrorState, PageLoader, SuccessNote } from '@/components/ui/States';
import type { SiteSettings } from '@/types/api';

/** Keys the UI knows about, with a label and how to render each one. */
interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'url' | 'email' | 'textarea' | 'longtext';
  hint?: string;
}

const GROUPS: Array<{ title: string; description: string; fields: FieldSpec[] }> = [
  {
    title: 'Identity',
    description: 'What the site calls itself, and the headline on the landing page.',
    fields: [
      { key: 'site_name', label: 'Site name' },
      { key: 'site_tagline', label: 'Tagline' },
      { key: 'hero_eyebrow', label: 'Hero eyebrow', hint: 'The small line above the headline.' },
      { key: 'hero_heading', label: 'Hero headline', type: 'textarea' },
      { key: 'hero_subheading', label: 'Hero subheading', type: 'textarea' },
    ],
  },
  {
    title: 'About',
    description: 'How the branch describes itself on the landing page and /about.',
    fields: [
      { key: 'about_short', label: 'One-line summary', type: 'textarea' },
      {
        key: 'about_body',
        label: 'Full description',
        type: 'longtext',
        hint: 'Blank lines separate paragraphs.',
      },
    ],
  },
  {
    title: 'Membership',
    description: 'The join call to action.',
    fields: [
      { key: 'join_url', label: 'Application form URL', type: 'url' },
      { key: 'join_heading', label: 'Join heading' },
      {
        key: 'join_perks',
        label: 'Membership perks',
        type: 'longtext',
        hint: 'One perk per line.',
      },
    ],
  },
  {
    title: 'Contact',
    description: 'Shown in the footer and on /contact.',
    fields: [
      { key: 'contact_email', label: 'Email', type: 'email' },
      { key: 'contact_address', label: 'Address', type: 'textarea' },
      { key: 'contact_heading', label: 'Contact page heading' },
      { key: 'contact_body', label: 'Contact page intro', type: 'textarea' },
    ],
  },
  {
    title: 'Social',
    description: 'Leave one empty to hide that icon.',
    fields: [
      { key: 'instagram_url', label: 'Instagram', type: 'url' },
      { key: 'linkedin_url', label: 'LinkedIn', type: 'url' },
      { key: 'twitter_url', label: 'X', type: 'url' },
      { key: 'youtube_url', label: 'YouTube', type: 'url' },
      { key: 'facebook_url', label: 'Facebook', type: 'url' },
      { key: 'branding_url', label: 'Graphic identity', type: 'url' },
    ],
  },
  {
    title: 'Affiliations',
    description: 'Linked from the footer.',
    fields: [
      { key: 'institute_url', label: 'IIIT Delhi', type: 'url' },
      { key: 'ieee_url', label: 'IEEE', type: 'url' },
      { key: 'wie_url', label: 'Women in Engineering', type: 'url' },
      { key: 'compsoc_url', label: 'Computer Society', type: 'url' },
    ],
  },
  {
    title: 'Search engines',
    description: 'What search results show for the site.',
    fields: [{ key: 'meta_description', label: 'Meta description', type: 'textarea' }],
  },
];

const KNOWN_KEYS = new Set(GROUPS.flatMap((group) => group.fields.map((field) => field.key)));

function SettingField({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  const rows = spec.type === 'longtext' ? 8 : 2;

  return (
    <Labelled label={spec.label} hint={spec.hint}>
      {(props) =>
        spec.type === 'textarea' || spec.type === 'longtext' ? (
          <textarea
            {...props}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cx(props.className, 'resize-y')}
          />
        ) : (
          <input
            {...props}
            type={spec.type ?? 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Labelled>
  );
}

function PasswordSection() {
  const { signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);

  const [change, { submitting, error }] = useMutation(authApi.changePassword);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (next !== confirm) {
        setMismatch(true);
        return;
      }
      setMismatch(false);

      const result = await change(current, next);
      if (result) {
        setDone(true);
        setCurrent('');
        setNext('');
        setConfirm('');
        // Changing the password retires every token, including this one, so
        // the session has to end.
        window.setTimeout(() => void signOut(), 2500);
      }
    },
    [current, next, confirm, change, signOut],
  );

  return (
    <section aria-labelledby="password-heading" className="card p-5">
      <h2 id="password-heading" className="mb-1 font-semibold">
        Change password
      </h2>
      <p className="mb-5 text-sm text-muted">
        Changing it signs out every existing session, including this one.
      </p>

      {done ? (
        <SuccessNote>Password updated. Signing you out…</SuccessNote>
      ) : (
        <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
          <Labelled label="Current password">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="New password" hint="At least 12 characters.">
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            )}
          </Labelled>

          <Labelled
            label="Confirm new password"
            error={mismatch ? 'The two passwords do not match.' : undefined}
          >
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setMismatch(false);
                }}
              />
            )}
          </Labelled>

          <MutationError error={error} />

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !current || !next || !confirm}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </section>
  );
}

export default function AdminSettingsPage() {
  const { data, error, loading, reload } = useAsync((signal) => adminApi.settings.read(signal), []);
  const [values, setValues] = useState<SiteSettings>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  const [save, { submitting, error: saveError }] = useMutation(adminApi.settings.update);

  // Keys present in the database that this screen does not name explicitly.
  const extraKeys = useMemo(
    () =>
      Object.keys(values)
        .filter((key) => !KNOWN_KEYS.has(key))
        .sort(),
    [values],
  );

  const update = useCallback((key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const result = await save(values);
      if (result) {
        setToast('Settings saved');
        reload();
      }
    },
    [values, save, reload],
  );

  const isDirty = useMemo(() => {
    if (!data) return false;
    return Object.keys(values).some((key) => values[key] !== data[key]);
  }, [values, data]);

  return (
    <>
      <AdminHeader
        title="Settings"
        description="Copy and links used across the site. Changing them here updates every page that uses them."
      />

      <ContentFileNote file="content/site.yaml" />

      {loading && !data && <PageLoader label="Loading settings" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {GROUPS.map((group) => (
            <section
              key={group.title}
              aria-labelledby={`group-${group.title}`}
              className="card p-5"
            >
              <h2 id={`group-${group.title}`} className="font-semibold">
                {group.title}
              </h2>
              <p className="mb-5 text-sm text-muted">{group.description}</p>

              <div className="grid gap-5 sm:grid-cols-2">
                {group.fields.map((spec) => (
                  <div
                    key={spec.key}
                    className={
                      spec.type === 'longtext' || spec.type === 'textarea'
                        ? 'sm:col-span-2'
                        : undefined
                    }
                  >
                    <SettingField
                      spec={spec}
                      value={values[spec.key] ?? ''}
                      onChange={(value) => update(spec.key, value)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {extraKeys.length > 0 && (
            <section aria-labelledby="other-settings" className="card p-5">
              <h2 id="other-settings" className="font-semibold">
                Other settings
              </h2>
              <p className="mb-5 text-sm text-muted">
                Keys found in the database that this screen does not name. They usually come from
                content/site.yaml.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {extraKeys.map((key) => (
                  <SettingField
                    key={key}
                    spec={{ key, label: key }}
                    value={values[key] ?? ''}
                    onChange={(value) => update(key, value)}
                  />
                ))}
              </div>
            </section>
          )}

          <MutationError error={saveError} />

          {/* Pinned, because these forms are long enough to scroll past a
              button sitting at the bottom. */}
          <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lifted)]">
            {isDirty && <span className="mr-auto text-sm text-muted">Unsaved changes</span>}
            <button type="submit" className="btn btn-primary" disabled={submitting || !isDirty}>
              {submitting ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <PasswordSection />
      </div>

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
