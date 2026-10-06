/**
 * Alumni management.
 *
 * Only publicly shareable details are editable here - there is deliberately
 * no field for a personal phone number or address, so none can be published
 * by accident.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api/endpoints';
import { useAsync, useMutation } from '@/hooks/useAsync';
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
import { Avatar } from '@/components/ui/Media';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { EditIcon, PlusIcon, TrashIcon, UsersIcon } from '@/components/ui/Icons';
import type { AlumnusAdmin } from '@/types/api';

type AlumnusDraft = Partial<AlumnusAdmin> & { name: string };

const EMPTY_ALUMNUS: AlumnusDraft = {
  name: '',
  photo: null,
  graduation_year: null,
  degree: '',
  branch: '',
  current_role: '',
  current_organization: '',
  ieee_position: '',
  linkedin_url: null,
  github_url: null,
  website_url: null,
  is_featured: false,
};

function AlumnusEditor({
  alumnus,
  onClose,
  onSaved,
}: {
  alumnus: AlumnusAdmin | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<AlumnusDraft>(EMPTY_ALUMNUS);

  useEffect(() => {
    setValues(alumnus ? { ...alumnus } : EMPTY_ALUMNUS);
  }, [alumnus]);

  const [save, { submitting, error, fieldErrors }] = useMutation(async (draft: AlumnusDraft) =>
    alumnus ? adminApi.alumni.update(alumnus.id, draft) : adminApi.alumni.create(draft),
  );

  const update = useCallback(<K extends keyof AlumnusDraft>(key: K, value: AlumnusDraft[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const payload: AlumnusDraft = {
        ...values,
        degree: values.degree?.trim() || null,
        branch: values.branch?.trim() || null,
        current_role: values.current_role?.trim() || null,
        current_organization: values.current_organization?.trim() || null,
        ieee_position: values.ieee_position?.trim() || null,
        linkedin_url: values.linkedin_url?.trim() || null,
        github_url: values.github_url?.trim() || null,
        website_url: values.website_url?.trim() || null,
      };
      if (!alumnus) delete payload.slug;

      const result = await save(payload);
      if (result) {
        onSaved(alumnus ? 'Alumnus updated' : 'Alumnus added');
        onClose();
      }
    },
    [values, alumnus, save, onSaved, onClose],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={alumnus ? 'Edit alumnus' : 'Add alumnus'}
      description="Only details the branch is happy to publish belong here."
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
            form="alumnus-form"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : alumnus ? 'Save changes' : 'Add alumnus'}
          </button>
        </>
      }
    >
      <form id="alumnus-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Name" error={fieldErrors.name}>
            {(props) => (
              <input
                {...props}
                type="text"
                required
                maxLength={160}
                value={values.name}
                onChange={(e) => update('name', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Graduation year" optional error={fieldErrors.graduation_year}>
            {(props) => (
              <input
                {...props}
                type="number"
                min={1990}
                max={2100}
                value={values.graduation_year ?? ''}
                onChange={(e) =>
                  update('graduation_year', e.target.value ? Number(e.target.value) : null)
                }
              />
            )}
          </Labelled>

          <Labelled label="Degree" optional hint="e.g. B.Tech.">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                value={values.degree ?? ''}
                onChange={(e) => update('degree', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Branch" optional hint="e.g. CSE, ECE">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                value={values.branch ?? ''}
                onChange={(e) => update('branch', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Current role" optional hint="e.g. Software Engineer">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={200}
                value={values.current_role ?? ''}
                onChange={(e) => update('current_role', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Current organisation" optional>
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={200}
                value={values.current_organization ?? ''}
                onChange={(e) => update('current_organization', e.target.value)}
              />
            )}
          </Labelled>
        </div>

        <Labelled label="Position held at IEEE IIITD" optional hint="e.g. Chairperson 2022-23">
          {(props) => (
            <input
              {...props}
              type="text"
              maxLength={160}
              value={values.ieee_position ?? ''}
              onChange={(e) => update('ieee_position', e.target.value)}
            />
          )}
        </Labelled>

        <ImagePicker
          label="Photo"
          value={values.photo ?? null}
          onChange={(url) => update('photo', url)}
        />

        <fieldset className="space-y-4">
          <legend className="field-label">Public profiles (all optional)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label="LinkedIn" optional error={fieldErrors.linkedin_url}>
              {(props) => (
                <input
                  {...props}
                  type="url"
                  placeholder="https://linkedin.com/in/…"
                  value={values.linkedin_url ?? ''}
                  onChange={(e) => update('linkedin_url', e.target.value)}
                />
              )}
            </Labelled>
            <Labelled label="GitHub" optional error={fieldErrors.github_url}>
              {(props) => (
                <input
                  {...props}
                  type="url"
                  placeholder="https://github.com/…"
                  value={values.github_url ?? ''}
                  onChange={(e) => update('github_url', e.target.value)}
                />
              )}
            </Labelled>
          </div>
        </fieldset>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <Toggle
            label="Featured"
            description="Featured alumni appear in the strip on the landing page."
            checked={values.is_featured ?? false}
            onChange={(checked) => update('is_featured', checked)}
          />
        </div>

        <MutationError error={error} />
      </form>
    </Modal>
  );
}

export default function AdminAlumniPage() {
  const [editing, setEditing] = useState<AlumnusAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AlumnusAdmin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync((signal) => adminApi.alumni.list(signal), []);

  const [remove, { submitting: removing }] = useMutation(adminApi.alumni.remove);
  const [reorder] = useMutation(adminApi.alumni.reorder);

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
      setToast('Alumnus removed');
      setDeleting(null);
      reload();
    }
  }, [deleting, remove, reload]);

  return (
    <>
      <AdminHeader
        title="Alumni"
        count={data?.length}
        description="Former members and where they are now."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            Add alumnus
          </button>
        }
      />

      <ContentFileNote file="content/alumni.yaml" />

      {loading && !data && <PageLoader label="Loading alumni" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="No alumni recorded yet"
          description="Add them here, or list them in content/alumni.yaml and run just content-import."
        />
      )}

      {data && data.length > 0 && (
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          {data.map((alumnus, index) => (
            <li
              key={alumnus.id}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <ReorderControls
                label={alumnus.name}
                onUp={() => move(index, -1)}
                onDown={() => move(index, 1)}
                disabledUp={index === 0}
                disabledDown={index === data.length - 1}
              />

              <Avatar src={alumnus.photo} name={alumnus.name} size="size-10" />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-strong">
                  {alumnus.name}
                  {alumnus.is_featured && (
                    <span className="ml-2 text-xs text-emphasis">Featured</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {[alumnus.current_role, alumnus.current_organization]
                    .filter(Boolean)
                    .join(' at ') || '—'}
                </p>
              </div>

              <span className="hidden shrink-0 font-mono text-xs text-faint tabular sm:block">
                {alumnus.graduation_year ?? '—'}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(alumnus)}
                  className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-accent"
                  aria-label={`Edit ${alumnus.name}`}
                  title="Edit"
                >
                  <EditIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(alumnus)}
                  className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--color-crimson-400)]"
                  aria-label={`Remove ${alumnus.name}`}
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
        <AlumnusEditor
          alumnus={editing}
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
