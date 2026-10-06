/**
 * IEEE Day management.
 *
 * An edition is saved whole - theme, stats, highlights and gallery together
 * - because that is how the API models it and how the page reads. Each
 * child collection is edited as a list of rows that can be added, removed
 * and reordered before saving.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api/endpoints';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { cx, formatShortDate } from '@/utils/format';
import {
  AdminHeader,
  ConfirmDelete,
  ContentFileNote,
  ImagePicker,
  Labelled,
  Modal,
  MutationError,
  SavedToast,
  StatusPill,
  Toggle,
} from './components/AdminUi';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { EditIcon, PlusIcon, SparkIcon, TrashIcon } from '@/components/ui/Icons';
import type { IeeeDayEdition, IeeeDayHighlight, IeeeDayPhoto, IeeeDayStat } from '@/types/api';

/** What the editor holds - an edition minus its read-only event list. */
type EditionDraft = Omit<IeeeDayEdition, 'events'>;

function emptyEdition(): EditionDraft {
  return {
    year: new Date().getFullYear(),
    theme: '',
    tagline: '',
    description: '',
    celebrated_on: null,
    hero_image: null,
    is_current: false,
    highlights: [],
    stats: [],
    gallery: [],
  };
}

/** A removable row inside one of the child collections. */
function RepeaterRow({
  children,
  onRemove,
  label,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  label: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
      <div className="min-w-0 flex-1 space-y-3">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-8 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--color-crimson-400)]"
        aria-label={`Remove ${label}`}
        title="Remove"
      >
        <TrashIcon className="size-4" />
      </button>
    </li>
  );
}

function EditionEditor({
  edition,
  onClose,
  onSaved,
}: {
  edition: IeeeDayEdition | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<EditionDraft>(emptyEdition);

  useEffect(() => {
    if (edition) {
      const { events: _events, ...rest } = edition;
      setValues(rest);
    } else {
      setValues(emptyEdition());
    }
  }, [edition]);

  const [save, { submitting, error, fieldErrors }] = useMutation(async (draft: EditionDraft) =>
    adminApi.ieeeDay.save(draft.year, draft),
  );

  const update = useCallback(<K extends keyof EditionDraft>(key: K, value: EditionDraft[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const updateStat = useCallback((index: number, patch: Partial<IeeeDayStat>) => {
    setValues((current) => ({
      ...current,
      stats: current.stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat)),
    }));
  }, []);

  const updateHighlight = useCallback((index: number, patch: Partial<IeeeDayHighlight>) => {
    setValues((current) => ({
      ...current,
      highlights: current.highlights.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }, []);

  const updatePhoto = useCallback((index: number, patch: Partial<IeeeDayPhoto>) => {
    setValues((current) => ({
      ...current,
      gallery: current.gallery.map((photo, i) => (i === index ? { ...photo, ...patch } : photo)),
    }));
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const payload: EditionDraft = {
        ...values,
        theme: values.theme?.trim() || null,
        tagline: values.tagline?.trim() || null,
        description: values.description?.trim() || null,
        // Drop rows the editor left blank rather than saving empty entries.
        stats: values.stats.filter((stat) => stat.label.trim() && stat.value.trim()),
        highlights: values.highlights.filter((item) => item.title.trim()),
        gallery: values.gallery.filter((photo) => photo.image.trim()),
      };

      const result = await save(payload);
      if (result) {
        onSaved(edition ? 'Edition updated' : 'Edition created');
        onClose();
      }
    },
    [values, edition, save, onSaved, onClose],
  );

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={edition ? `Edit IEEE Day ${edition.year}` : 'New IEEE Day edition'}
      description="Sections you leave empty are simply not rendered on the page."
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
          <button
            type="submit"
            form="edition-form"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save edition'}
          </button>
        </>
      }
    >
      <form id="edition-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Year" error={fieldErrors.year}>
            {(props) => (
              <input
                {...props}
                type="number"
                required
                min={2000}
                max={2100}
                // The year is the edition's identity, so it cannot change.
                disabled={edition !== null}
                value={values.year}
                onChange={(e) => update('year', Number(e.target.value))}
              />
            )}
          </Labelled>

          <Labelled
            label="Date celebrated"
            optional
            hint="IEEE Day falls on the first Tuesday of October."
          >
            {(props) => (
              <input
                {...props}
                type="date"
                value={values.celebrated_on ?? ''}
                onChange={(e) => update('celebrated_on', e.target.value || null)}
              />
            )}
          </Labelled>
        </div>

        <Labelled label="Theme" optional hint="The headline for this edition.">
          {(props) => (
            <input
              {...props}
              type="text"
              maxLength={300}
              value={values.theme ?? ''}
              onChange={(e) => update('theme', e.target.value)}
            />
          )}
        </Labelled>

        <Labelled label="Tagline" optional>
          {(props) => (
            <input
              {...props}
              type="text"
              maxLength={300}
              value={values.tagline ?? ''}
              onChange={(e) => update('tagline', e.target.value)}
            />
          )}
        </Labelled>

        <Labelled label="Description" optional hint="Blank lines separate paragraphs.">
          {(props) => (
            <textarea
              {...props}
              rows={6}
              maxLength={8000}
              value={values.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              className={cx(props.className, 'resize-y')}
            />
          )}
        </Labelled>

        <ImagePicker
          label="Hero image"
          value={values.hero_image}
          onChange={(url) => update('hero_image', url)}
        />

        {/* --- Stats --- */}
        <fieldset className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <legend className="field-label mb-0">Statistics</legend>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => update('stats', [...values.stats, { label: '', value: '' }])}
            >
              <PlusIcon className="size-3.5" />
              Add
            </button>
          </div>

          {values.stats.length === 0 ? (
            <p className="field-hint">
              No statistics yet. Add things like "450 participants" or "12 events".
            </p>
          ) : (
            <ul className="space-y-2">
              {values.stats.map((stat, index) => (
                <RepeaterRow
                  key={index}
                  label={stat.label || `statistic ${index + 1}`}
                  onRemove={() =>
                    update(
                      'stats',
                      values.stats.filter((_, i) => i !== index),
                    )
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={stat.value}
                      onChange={(e) => updateStat(index, { value: e.target.value })}
                      placeholder="450"
                      aria-label={`Statistic ${index + 1} value`}
                      className="field"
                      maxLength={60}
                    />
                    <input
                      type="text"
                      value={stat.label}
                      onChange={(e) => updateStat(index, { label: e.target.value })}
                      placeholder="Participants"
                      aria-label={`Statistic ${index + 1} label`}
                      className="field"
                      maxLength={120}
                    />
                  </div>
                </RepeaterRow>
              ))}
            </ul>
          )}
        </fieldset>

        {/* --- Highlights --- */}
        <fieldset className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <legend className="field-label mb-0">Highlights</legend>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                update('highlights', [
                  ...values.highlights,
                  { title: '', description: '', image: null },
                ])
              }
            >
              <PlusIcon className="size-3.5" />
              Add
            </button>
          </div>

          {values.highlights.length === 0 ? (
            <p className="field-hint">No highlights yet.</p>
          ) : (
            <ul className="space-y-2">
              {values.highlights.map((highlight, index) => (
                <RepeaterRow
                  key={index}
                  label={highlight.title || `highlight ${index + 1}`}
                  onRemove={() =>
                    update(
                      'highlights',
                      values.highlights.filter((_, i) => i !== index),
                    )
                  }
                >
                  <input
                    type="text"
                    value={highlight.title}
                    onChange={(e) => updateHighlight(index, { title: e.target.value })}
                    placeholder="Keynote"
                    aria-label={`Highlight ${index + 1} title`}
                    className="field"
                    maxLength={250}
                  />
                  <textarea
                    rows={2}
                    value={highlight.description ?? ''}
                    onChange={(e) => updateHighlight(index, { description: e.target.value })}
                    placeholder="What happened"
                    aria-label={`Highlight ${index + 1} description`}
                    className="field resize-y"
                    maxLength={2000}
                  />
                  <ImagePicker
                    label={`Highlight ${index + 1} image`}
                    value={highlight.image}
                    onChange={(url) => updateHighlight(index, { image: url })}
                  />
                </RepeaterRow>
              ))}
            </ul>
          )}
        </fieldset>

        {/* --- Gallery --- */}
        <fieldset className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <legend className="field-label mb-0">Gallery</legend>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => update('gallery', [...values.gallery, { image: '', caption: '' }])}
            >
              <PlusIcon className="size-3.5" />
              Add photo
            </button>
          </div>

          {values.gallery.length === 0 ? (
            <p className="field-hint">No photos yet.</p>
          ) : (
            <ul className="space-y-2">
              {values.gallery.map((photo, index) => (
                <RepeaterRow
                  key={index}
                  label={`photo ${index + 1}`}
                  onRemove={() =>
                    update(
                      'gallery',
                      values.gallery.filter((_, i) => i !== index),
                    )
                  }
                >
                  <ImagePicker
                    label={`Photo ${index + 1}`}
                    value={photo.image || null}
                    onChange={(url) => updatePhoto(index, { image: url ?? '' })}
                  />
                  <input
                    type="text"
                    value={photo.caption ?? ''}
                    onChange={(e) => updatePhoto(index, { caption: e.target.value })}
                    placeholder="Caption (also used as the image description)"
                    aria-label={`Photo ${index + 1} caption`}
                    className="field"
                    maxLength={300}
                  />
                </RepeaterRow>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <Toggle
            label="Current edition"
            description="The current edition is the one /ieee-day opens on. Only one can be current."
            checked={values.is_current}
            onChange={(checked) => update('is_current', checked)}
          />
        </div>

        <MutationError error={error} />
      </form>
    </Modal>
  );
}

export default function AdminIeeeDayPage() {
  const [editing, setEditing] = useState<IeeeDayEdition | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<IeeeDayEdition | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync((signal) => adminApi.ieeeDay.list(signal), []);

  const [remove, { submitting: removing }] = useMutation(adminApi.ieeeDay.remove);

  const onDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await remove(deleting.year);
    if (result) {
      setToast('Edition deleted');
      setDeleting(null);
      reload();
    }
  }, [deleting, remove, reload]);

  return (
    <>
      <AdminHeader
        title="IEEE Day"
        count={data?.length}
        description="One entry per year. Tag an event with an IEEE Day year to list it on that edition's page."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            New edition
          </button>
        }
      />

      <ContentFileNote file="content/ieee-day.yaml" />

      {loading && !data && <PageLoader label="Loading editions" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={<SparkIcon className="size-5" />}
          title="No IEEE Day editions yet"
          description="Create one here, or describe it in content/ieee-day.yaml and run just content-import."
        />
      )}

      {data && data.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.map((edition) => (
            <li key={edition.year}>
              <article className="card flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-bold tabular">{edition.year}</h2>
                      {edition.is_current && <StatusPill tone="live">Current</StatusPill>}
                    </div>
                    {edition.celebrated_on && (
                      <p className="font-mono text-xs text-faint">
                        {formatShortDate(edition.celebrated_on)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(edition)}
                      className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-accent"
                      aria-label={`Edit IEEE Day ${edition.year}`}
                      title="Edit"
                    >
                      <EditIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(edition)}
                      className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--color-crimson-400)]"
                      aria-label={`Delete IEEE Day ${edition.year}`}
                      title="Delete"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </div>

                {edition.theme && <p className="font-medium text-strong">{edition.theme}</p>}
                {edition.tagline && <p className="text-sm text-muted">{edition.tagline}</p>}

                <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--border-subtle)] pt-3 font-mono text-[0.625rem] tracking-wide text-faint uppercase">
                  {[
                    ['Stats', edition.stats.length],
                    ['Highlights', edition.highlights.length],
                    ['Photos', edition.gallery.length],
                    ['Events', edition.events.length],
                  ].map(([label, count]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <dt>{label}</dt>
                      <dd className="text-default tabular">{count}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <EditionEditor
          edition={editing}
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
        itemName={`IEEE Day ${deleting?.year ?? ''}`}
        busy={removing}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
        note="Events tagged with this year keep their tag; they simply stop appearing on an IEEE Day page."
      />

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
