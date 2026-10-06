/**
 * The contact-form inbox.
 *
 * A list beside a reading pane, so triage is one click rather than a
 * navigation. Opening a message marks it read server-side, which is what
 * keeps the sidebar badge honest.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api/endpoints';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { INQUIRY_TYPE_LABELS, SUBMISSION_STATUS_LABELS, cx, formatDate } from '@/utils/format';
import {
  AdminHeader,
  ConfirmDelete,
  MutationError,
  SavedToast,
  StatusPill,
} from './components/AdminUi';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { InboxIcon, MailIcon, TrashIcon } from '@/components/ui/Icons';
import type { ContactSubmissionAdmin, SubmissionStatus } from '@/types/api';

const FILTERS: Array<{ value: SubmissionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'replied', label: 'Replied' },
  { value: 'archived', label: 'Archived' },
];

function statusTone(status: SubmissionStatus): 'live' | 'draft' | 'muted' {
  if (status === 'new') return 'draft';
  if (status === 'replied') return 'live';
  return 'muted';
}

function SubmissionDetail({
  submission,
  onChanged,
  onDelete,
}: {
  submission: ContactSubmissionAdmin;
  onChanged: (updated: ContactSubmissionAdmin) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(submission.admin_notes ?? '');
  const [update, { submitting, error }] = useMutation(adminApi.submissions.update);

  useEffect(() => setNotes(submission.admin_notes ?? ''), [submission.id, submission.admin_notes]);

  const setStatus = useCallback(
    async (status: SubmissionStatus) => {
      const result = await update(submission.id, { status });
      if (result) onChanged(result);
    },
    [submission.id, update, onChanged],
  );

  const saveNotes = useCallback(async () => {
    const result = await update(submission.id, { admin_notes: notes });
    if (result) onChanged(result);
  }, [submission.id, notes, update, onChanged]);

  // A reply opens in the admin's own mail client, pre-addressed. The site
  // deliberately does not send mail on their behalf.
  const replyHref = `mailto:${submission.email}?subject=${encodeURIComponent(
    `Re: ${submission.subject || 'Your message to IEEE IIIT Delhi'}`,
  )}`;

  return (
    <article className="card flex h-full flex-col">
      <header className="space-y-3 border-b border-[var(--border-subtle)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold">
              {submission.subject || `Message from ${submission.name}`}
            </h2>
            <p className="text-sm text-muted">
              {submission.name}
              {submission.organization && ` · ${submission.organization}`}
            </p>
          </div>
          <StatusPill tone={statusTone(submission.status)}>
            {SUBMISSION_STATUS_LABELS[submission.status]}
          </StatusPill>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-faint">Email</dt>
            <dd className="min-w-0">
              <a
                href={`mailto:${submission.email}`}
                className="truncate text-accent hover:underline"
              >
                {submission.email}
              </a>
            </dd>
          </div>
          {submission.phone && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-faint">Phone</dt>
              <dd className="text-default">{submission.phone}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="shrink-0 text-faint">About</dt>
            <dd className="text-default">
              {INQUIRY_TYPE_LABELS[submission.inquiry_type] ?? submission.inquiry_type}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-faint">Received</dt>
            <dd className="text-default">{formatDate(submission.created_at)}</dd>
          </div>
        </dl>
      </header>

      <div className="flex-1 p-5">
        <h3 className="field-label">Message</h3>
        {/* whitespace-pre-line keeps the sender's own paragraph breaks; the
            text is rendered as text, never as markup. */}
        <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 text-sm leading-relaxed whitespace-pre-line text-default">
          {submission.message}
        </p>

        <div className="mt-5">
          <label htmlFor="submission-notes" className="field-label">
            Internal notes
          </label>
          <textarea
            id="submission-notes"
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Only the administrator sees these."
            className="field resize-y"
          />
          <p className="field-hint">Saved when you click away.</p>
        </div>

        <MutationError error={error} />
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] p-5">
        <a href={replyHref} className="btn btn-primary btn-sm">
          <MailIcon className="size-4" />
          Reply by email
        </a>

        {submission.status !== 'replied' && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setStatus('replied')}
            disabled={submitting}
          >
            Mark replied
          </button>
        )}
        {submission.status !== 'archived' && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus('archived')}
            disabled={submitting}
          >
            Archive
          </button>
        )}
        {submission.status === 'archived' && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus('read')}
            disabled={submitting}
          >
            Unarchive
          </button>
        )}

        <button type="button" className="btn btn-danger btn-sm ml-auto" onClick={onDelete}>
          <TrashIcon className="size-4" />
          Delete
        </button>
      </footer>
    </article>
  );
}

export default function AdminSubmissionsPage() {
  const [filter, setFilter] = useState<SubmissionStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ContactSubmissionAdmin | null>(null);
  const [deleting, setDeleting] = useState<ContactSubmissionAdmin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(
    (signal) =>
      adminApi.submissions.list(
        { per_page: 100, status: filter === 'all' ? null : filter },
        signal,
      ),
    [filter],
  );

  const [remove, { submitting: removing }] = useMutation(adminApi.submissions.remove);

  // Reading one marks it read on the server, so the badge and the list both
  // need the version that comes back.
  const open = useCallback(
    async (submission: ContactSubmissionAdmin) => {
      setSelectedId(submission.id);
      setSelected(submission);
      try {
        const fresh = await adminApi.submissions.read(submission.id);
        setSelected(fresh);
        if (fresh.status !== submission.status) reload();
      } catch {
        // Keep showing the list copy if the refresh fails.
      }
    },
    [reload],
  );

  const onDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await remove(deleting.id);
    if (result) {
      setToast('Message deleted');
      setDeleting(null);
      if (selectedId === deleting.id) {
        setSelectedId(null);
        setSelected(null);
      }
      reload();
    }
  }, [deleting, remove, reload, selectedId]);

  const submissions = data?.items ?? [];

  return (
    <>
      <AdminHeader
        title="Inbox"
        count={data?.total}
        description="Everything sent through the contact and collaboration form."
      />

      <div className="mb-6 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={cx('chip chip-button', filter === option.value && 'chip-active')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && !data && <PageLoader label="Loading messages" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && submissions.length === 0 && (
        <EmptyState
          icon={<InboxIcon className="size-5" />}
          title={filter === 'all' ? 'No messages yet' : 'Nothing in this view'}
          description={
            filter === 'all'
              ? 'Submissions from the contact form land here, and the administrator is notified by email.'
              : 'Try another filter.'
          }
        />
      )}

      {submissions.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
          <ul className="card max-h-[70vh] divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {submissions.map((submission) => (
              <li key={submission.id}>
                <button
                  type="button"
                  onClick={() => open(submission)}
                  aria-current={selectedId === submission.id ? 'true' : undefined}
                  className={cx(
                    'w-full px-4 py-3 text-left transition-colors',
                    selectedId === submission.id
                      ? 'bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]'
                      : 'hover:bg-[var(--surface-sunken)]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cx(
                        'truncate text-sm',
                        submission.status === 'new'
                          ? 'font-semibold text-strong'
                          : 'font-medium text-default',
                      )}
                    >
                      {submission.subject || submission.name}
                    </span>
                    {submission.status === 'new' && (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                        aria-label="Unread"
                      />
                    )}
                  </div>
                  <p className="truncate text-xs text-muted">{submission.email}</p>
                  <p className="mt-1 font-mono text-[0.625rem] text-faint">
                    {INQUIRY_TYPE_LABELS[submission.inquiry_type] ?? submission.inquiry_type} ·{' '}
                    {formatDate(submission.created_at)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {selected ? (
              <SubmissionDetail
                submission={selected}
                onChanged={(updated) => {
                  setSelected(updated);
                  reload();
                }}
                onDelete={() => setDeleting(selected)}
              />
            ) : (
              <EmptyState
                icon={<MailIcon className="size-5" />}
                title="Nothing selected"
                description="Pick a message from the list to read it."
                className="h-full"
              />
            )}
          </div>
        </div>
      )}

      <ConfirmDelete
        open={deleting !== null}
        itemName={deleting?.subject || `Message from ${deleting?.name ?? ''}`}
        busy={removing}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        note="Consider archiving instead if you might need this enquiry later."
      />

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
