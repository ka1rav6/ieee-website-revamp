/**
 * Collaboration management: logos, descriptions, type, year and ordering.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api/endpoints';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { cx } from '@/utils/format';
import {
  AdminHeader,
  ConfirmDelete,
  ContentFileNote,
  ImagePicker,
  Labelled,
  Modal,
  MutationError,
  ReorderControls,
  SavedToast,
  Toggle,
} from './components/AdminUi';
import { LogoMark } from '@/components/ui/Media';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { BuildingIcon, EditIcon, PlusIcon, TrashIcon } from '@/components/ui/Icons';
import type { CollaborationAdmin } from '@/types/api';

type CollaborationDraft = Partial<CollaborationAdmin> & { name: string };

const EMPTY_COLLABORATION: CollaborationDraft = {
  name: '',
  logo: null,
  description: '',
  collaboration_type: '',
  year: null,
  website_url: null,
  is_featured: false,
};

/** Common kinds, offered as suggestions rather than a closed list. */
const TYPE_SUGGESTIONS = [
  'Sponsor',
  'Workshop partner',
  'Speaker',
  'Prize partner',
  'Research partner',
];

function CollaborationEditor({
  collaboration,
  onClose,
  onSaved,
}: {
  collaboration: CollaborationAdmin | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<CollaborationDraft>(EMPTY_COLLABORATION);

  useEffect(() => {
    setValues(collaboration ? { ...collaboration } : EMPTY_COLLABORATION);
  }, [collaboration]);

  const [save, { submitting, error, fieldErrors }] = useMutation(
    async (draft: CollaborationDraft) =>
      collaboration
        ? adminApi.collaborations.update(collaboration.id, draft)
        : adminApi.collaborations.create(draft),
  );

  const update = useCallback(
    <K extends keyof CollaborationDraft>(key: K, value: CollaborationDraft[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const payload: CollaborationDraft = {
        ...values,
        description: values.description?.trim() || null,
        collaboration_type: values.collaboration_type?.trim() || null,
        website_url: values.website_url?.trim() || null,
      };
      if (!collaboration) delete payload.slug;

      const result = await save(payload);
      if (result) {
        onSaved(collaboration ? 'Collaboration updated' : 'Collaboration added');
        onClose();
      }
    },
    [values, collaboration, save, onSaved, onClose],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={collaboration ? 'Edit collaboration' : 'Add collaboration'}
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
            form="collaboration-form"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : collaboration ? 'Save changes' : 'Add collaboration'}
          </button>
        </>
      }
    >
      <form id="collaboration-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <Labelled label="Organisation name" error={fieldErrors.name}>
          {(props) => (
            <input
              {...props}
              type="text"
              required
              maxLength={200}
              value={values.name}
              onChange={(e) => update('name', e.target.value)}
            />
          )}
        </Labelled>

        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Collaboration type" optional hint="How you worked together">
            {(props) => (
              <>
                <input
                  {...props}
                  type="text"
                  list="collaboration-types"
                  maxLength={120}
                  value={values.collaboration_type ?? ''}
                  onChange={(e) => update('collaboration_type', e.target.value)}
                />
                <datalist id="collaboration-types">
                  {TYPE_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </>
            )}
          </Labelled>

          <Labelled label="Year" optional error={fieldErrors.year}>
            {(props) => (
              <input
                {...props}
                type="number"
                min={1990}
                max={2100}
                value={values.year ?? ''}
                onChange={(e) => update('year', e.target.value ? Number(e.target.value) : null)}
              />
            )}
          </Labelled>
        </div>

        <Labelled label="Website" optional error={fieldErrors.website_url}>
          {(props) => (
            <input
              {...props}
              type="url"
              placeholder="https://"
              value={values.website_url ?? ''}
              onChange={(e) => update('website_url', e.target.value)}
            />
          )}
        </Labelled>

        <ImagePicker
          label="Logo"
          value={values.logo ?? null}
          onChange={(url) => update('logo', url)}
          hint="Logos are shown at a uniform height against a neutral tile."
        />

        <Labelled
          label="Description"
          optional
          error={fieldErrors.description}
          hint="A line about who they are, shown on the collaborations page."
        >
          {(props) => (
            <textarea
              {...props}
              rows={3}
              maxLength={2000}
              value={values.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              className={cx(props.className, 'resize-y')}
            />
          )}
        </Labelled>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <Toggle
            label="Featured"
            description="Featured collaborations lead the logo band on the landing page."
            checked={values.is_featured ?? false}
            onChange={(checked) => update('is_featured', checked)}
          />
        </div>

        <MutationError error={error} />
      </form>
    </Modal>
  );
}

export default function AdminCollaborationsPage() {
  const [editing, setEditing] = useState<CollaborationAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CollaborationAdmin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.collaborations.list(signal),
    [],
  );

  const [remove, { submitting: removing }] = useMutation(adminApi.collaborations.remove);
  const [reorder] = useMutation(adminApi.collaborations.reorder);

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      if (!data) return;
      const target = index + direction;
      if (target < 0 || target >= data.length) return;

      const reordered = [...data];
      const [moved] = reordered.splice(index, 1);
      if (moved) reordered.splice(target, 0, moved);

      const result = await reorder(reordered.map((item) => item.id));
      if (result) reload();
    },
    [data, reorder, reload],
  );

  const onDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await remove(deleting.id);
    if (result) {
      setToast('Collaboration removed');
      setDeleting(null);
      reload();
    }
  }, [deleting, remove, reload]);

  return (
    <>
      <AdminHeader
        title="Collaborations"
        count={data?.length}
        description="Organisations the branch has worked with. The order here is the order they appear in."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            Add collaboration
          </button>
        }
      />

      <ContentFileNote file="content/collaborations.yaml" />

      {loading && !data && <PageLoader label="Loading collaborations" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={<BuildingIcon className="size-5" />}
          title="No collaborations yet"
          description="Add them here, or list them in content/collaborations.yaml and run just content-import."
        />
      )}

      {data && data.length > 0 && (
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          {data.map((collaboration, index) => (
            <li
              key={collaboration.id}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <ReorderControls
                label={collaboration.name}
                onUp={() => move(index, -1)}
                onDown={() => move(index, 1)}
                disabledUp={index === 0}
                disabledDown={index === data.length - 1}
              />

              <div className="grid h-10 w-16 shrink-0 place-items-center rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2">
                <LogoMark
                  src={collaboration.logo}
                  name={collaboration.name}
                  className="max-h-6 text-xs"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-strong">
                  {collaboration.name}
                  {collaboration.is_featured && (
                    <span className="ml-2 text-xs text-emphasis">Featured</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {collaboration.collaboration_type ?? 'Type not recorded'}
                </p>
              </div>

              <span className="hidden shrink-0 font-mono text-xs text-faint tabular sm:block">
                {collaboration.year ?? '—'}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(collaboration)}
                  className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-accent"
                  aria-label={`Edit ${collaboration.name}`}
                  title="Edit"
                >
                  <EditIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(collaboration)}
                  className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--color-crimson-400)]"
                  aria-label={`Remove ${collaboration.name}`}
                  title="Remove"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <CollaborationEditor
          collaboration={editing}
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
        itemName={deleting?.name ?? ''}
        busy={removing}
        onCancel={() => setDeleting(null)}
        onConfirm={onDelete}
      />

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
