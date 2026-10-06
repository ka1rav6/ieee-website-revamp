/**
 * Event management: create, edit, publish and delete.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api/endpoints';
import { useAsync, useDebounced, useMutation } from '@/hooks/useAsync';
import { cx, formatShortDate } from '@/utils/format';
import {
  AdminHeader,
  AdminTable,
  ConfirmDelete,
  ContentFileNote,
  ImagePicker,
  Labelled,
  Modal,
  MutationError,
  SavedToast,
  StatusPill,
  Td,
  Th,
  Toggle,
} from './components/AdminUi';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { CalendarIcon, EditIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/ui/Icons';
import type { SiteEventAdmin } from '@/types/api';

type EventDraft = Partial<SiteEventAdmin> & { title: string };

const EMPTY_EVENT: EventDraft = {
  title: '',
  description: '',
  poster: null,
  event_date: null,
  location: '',
  category: '',
  registration_url: null,
  ieee_day_year: null,
  is_featured: false,
  is_published: true,
};

function EventEditor({
  event,
  onClose,
  onSaved,
}: {
  event: SiteEventAdmin | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<EventDraft>(EMPTY_EVENT);

  useEffect(() => {
    setValues(event ? { ...event } : EMPTY_EVENT);
  }, [event]);

  const [save, { submitting, error, fieldErrors }] = useMutation(async (draft: EventDraft) =>
    event ? adminApi.events.update(event.id, draft) : adminApi.events.create(draft),
  );

  const update = useCallback(<K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const onSubmit = useCallback(
    async (formEvent: React.FormEvent) => {
      formEvent.preventDefault();
      const payload: EventDraft = {
        ...values,
        description: values.description?.trim() || null,
        location: values.location?.trim() || null,
        category: values.category?.trim() || null,
        registration_url: values.registration_url?.trim() || null,
        event_date: values.event_date || null,
      };
      // Let the server derive the slug from the title for a new event.
      if (!event) delete payload.slug;

      const result = await save(payload);
      if (result) {
        onSaved(event ? 'Event updated' : 'Event created');
        onClose();
      }
    },
    [values, event, save, onSaved, onClose],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" form="event-form" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : event ? 'Save changes' : 'Create event'}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <Labelled label="Title" error={fieldErrors.title}>
          {(props) => (
            <input
              {...props}
              type="text"
              required
              maxLength={300}
              value={values.title}
              onChange={(e) => update('title', e.target.value)}
            />
          )}
        </Labelled>

        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Date" optional error={fieldErrors.event_date}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={values.event_date ?? ''}
                onChange={(e) => update('event_date', e.target.value || null)}
              />
            )}
          </Labelled>

          <Labelled label="Location" optional>
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={200}
                placeholder="e.g. R&D Block, IIIT Delhi"
                value={values.location ?? ''}
                onChange={(e) => update('location', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Category" optional hint="e.g. Workshop, Hackathon, Talk">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                value={values.category ?? ''}
                onChange={(e) => update('category', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled
            label="IEEE Day year"
            optional
            hint="Set this to list the event on that year's IEEE Day page."
            error={fieldErrors.ieee_day_year}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min={2000}
                max={2100}
                value={values.ieee_day_year ?? ''}
                onChange={(e) =>
                  update('ieee_day_year', e.target.value ? Number(e.target.value) : null)
                }
              />
            )}
          </Labelled>
        </div>

        <Labelled label="Description" optional error={fieldErrors.description}>
          {(props) => (
            <textarea
              {...props}
              rows={4}
              maxLength={4000}
              value={values.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              className={cx(props.className, 'resize-y')}
            />
          )}
        </Labelled>

        <Labelled
          label="Registration link"
          optional
          error={fieldErrors.registration_url}
          hint="A Register button appears on upcoming events that have one."
        >
          {(props) => (
            <input
              {...props}
              type="url"
              placeholder="https://"
              value={values.registration_url ?? ''}
              onChange={(e) => update('registration_url', e.target.value)}
            />
          )}
        </Labelled>

        <ImagePicker
          label="Poster"
          value={values.poster ?? null}
          onChange={(url) => update('poster', url)}
        />

        <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <Toggle
            label="Published"
            description="Unpublished events are hidden from the public events page."
            checked={values.is_published ?? true}
            onChange={(checked) => update('is_published', checked)}
          />
          <Toggle
            label="Featured"
            description="Featured events are promoted on the landing page."
            checked={values.is_featured ?? false}
            onChange={(checked) => update('is_featured', checked)}
          />
        </div>

        <MutationError error={error} />
      </form>
    </Modal>
  );
}

export default function AdminEventsPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim(), 300);

  const [editing, setEditing] = useState<SiteEventAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SiteEventAdmin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.events.list({ per_page: 200, search: search || undefined }, signal),
    [search],
  );

  const [remove, { submitting: removing }] = useMutation(adminApi.events.remove);

  const onDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await remove(deleting.id);
    if (result) {
      setToast('Event deleted');
      setDeleting(null);
      reload();
    }
  }, [deleting, remove, reload]);

  const events = data?.items ?? [];

  return (
    <>
      <AdminHeader
        title="Events"
        count={data?.total}
        description="Everything the branch has run or is about to run."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            New event
          </button>
        }
      />

      <ContentFileNote file="content/events.yaml" />

      <div className="relative mb-6 max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search events"
          aria-label="Search events"
          className="field pl-9"
        />
      </div>

      {loading && !data && <PageLoader label="Loading events" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && events.length === 0 && (
        <EmptyState
          icon={<CalendarIcon className="size-5" />}
          title={search ? 'Nothing matches' : 'No events yet'}
          description={
            search
              ? 'Try a shorter search.'
              : 'Add one here, or list them in content/events.yaml and run just content-import.'
          }
        />
      )}

      {events.length > 0 && (
        <AdminTable
          head={
            <tr>
              <Th>Event</Th>
              <Th>Date</Th>
              <Th>State</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {events.map((event) => (
            <tr key={event.slug} className="transition-colors hover:bg-[var(--surface-sunken)]">
              <Td>
                <div className="max-w-sm min-w-0">
                  <p className="truncate font-medium text-strong">{event.title}</p>
                  <p className="truncate text-xs text-muted">
                    {event.location || '—'}
                    {event.is_featured && <span className="ml-2 text-emphasis">Featured</span>}
                    {event.ieee_day_year && (
                      <span className="ml-2 text-accent">IEEE Day {event.ieee_day_year}</span>
                    )}
                  </p>
                </div>
              </Td>
              <Td>
                <span className="font-mono text-xs text-faint">
                  {formatShortDate(event.event_date) ?? '—'}
                </span>
              </Td>
              <Td>
                <StatusPill tone={event.is_published ? 'live' : 'draft'}>
                  {event.is_published ? 'Live' : 'Hidden'}
                </StatusPill>
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(event)}
                    className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-accent"
                    aria-label={`Edit ${event.title}`}
                    title="Edit"
                  >
                    <EditIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(event)}
                    className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--color-crimson-400)]"
                    aria-label={`Delete ${event.title}`}
                    title="Delete"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}

      {(creating || editing) && (
        <EventEditor
          event={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setToast(message);
            reload();
          }}
        />
      )}

      <ConfirmDelete
        open={deleting !== null}
        itemName={deleting?.title ?? ''}
        busy={removing}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        note="If this event also exists in content/events.yaml, remove it there too."
      />

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
