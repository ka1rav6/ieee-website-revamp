/**
 * Team management: add, edit, reorder and remove members.
 *
 * Grouped by category, because that is how the roster is published and how
 * ordering is read on the public page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/api/endpoints';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { TEAM_CATEGORY_LABELS, TEAM_CATEGORY_ORDER, cx } from '@/utils/format';
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
import type { TeamCategory, TeamMemberAdmin } from '@/types/api';

type MemberDraft = Partial<TeamMemberAdmin> & { name: string; category: TeamCategory };

const EMPTY_MEMBER: MemberDraft = {
  name: '',
  category: 'executive',
  position: '',
  photo: null,
  department: '',
  year: '',
  bio: '',
  email: null,
  linkedin_url: null,
  github_url: null,
  website_url: null,
  term: '',
  is_active: true,
};

function MemberEditor({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMemberAdmin | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<MemberDraft>(EMPTY_MEMBER);

  useEffect(() => {
    setValues(member ? { ...member } : EMPTY_MEMBER);
  }, [member]);

  const [save, { submitting, error, fieldErrors }] = useMutation(async (draft: MemberDraft) =>
    member ? adminApi.team.update(member.id, draft) : adminApi.team.create(draft),
  );

  const update = useCallback(<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      // Empty optional fields are sent as null so they clear the column
      // rather than storing an empty string.
      const payload: MemberDraft = {
        ...values,
        position: values.position?.trim() || null,
        department: values.department?.trim() || null,
        year: values.year?.trim() || null,
        bio: values.bio?.trim() || null,
        term: values.term?.trim() || null,
        email: values.email?.trim() || null,
        linkedin_url: values.linkedin_url?.trim() || null,
        github_url: values.github_url?.trim() || null,
        website_url: values.website_url?.trim() || null,
      };
      if (!member) delete payload.slug;

      const result = await save(payload);
      if (result) {
        onSaved(member ? 'Member updated' : 'Member added');
        onClose();
      }
    },
    [values, member, save, onSaved, onClose],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? 'Edit member' : 'Add member'}
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
            form="member-form"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : member ? 'Save changes' : 'Add member'}
          </button>
        </>
      }
    >
      <form id="member-form" onSubmit={onSubmit} noValidate className="space-y-5">
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

          <Labelled label="Category" error={fieldErrors.category}>
            {(props) => (
              <select
                {...props}
                value={values.category}
                onChange={(e) => update('category', e.target.value as TeamCategory)}
              >
                {TEAM_CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {TEAM_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            )}
          </Labelled>

          <Labelled label="Position" optional hint="e.g. Chairperson, Webmaster">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={160}
                value={values.position ?? ''}
                onChange={(e) => update('position', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Term" optional hint="e.g. 2025-26">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={40}
                value={values.term ?? ''}
                onChange={(e) => update('term', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Department" optional>
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={160}
                value={values.department ?? ''}
                onChange={(e) => update('department', e.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Year" optional hint="e.g. 3rd year">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={40}
                value={values.year ?? ''}
                onChange={(e) => update('year', e.target.value)}
              />
            )}
          </Labelled>
        </div>

        <ImagePicker
          label="Photo"
          value={values.photo ?? null}
          onChange={(url) => update('photo', url)}
        />

        <Labelled label="Short bio" optional error={fieldErrors.bio}>
          {(props) => (
            <textarea
              {...props}
              rows={3}
              maxLength={2000}
              value={values.bio ?? ''}
              onChange={(e) => update('bio', e.target.value)}
              className={cx(props.className, 'resize-y')}
            />
          )}
        </Labelled>

        <fieldset className="space-y-4">
          <legend className="field-label">Links (all optional)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label="Email" optional error={fieldErrors.email}>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  value={values.email ?? ''}
                  onChange={(e) => update('email', e.target.value)}
                />
              )}
            </Labelled>
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
          </div>
        </fieldset>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <Toggle
            label="Active"
            description="Inactive members are kept on record but hidden from the public team page."
            checked={values.is_active ?? true}
            onChange={(checked) => update('is_active', checked)}
          />
        </div>

        <MutationError error={error} />
      </form>
    </Modal>
  );
}

export default function AdminTeamPage() {
  const [editing, setEditing] = useState<TeamMemberAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TeamMemberAdmin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync((signal) => adminApi.team.list(signal), []);

  const [remove, { submitting: removing }] = useMutation(adminApi.team.remove);
  const [reorder] = useMutation(adminApi.team.reorder);

  const groups = useMemo(() => {
    if (!data) return [];
    return TEAM_CATEGORY_ORDER.map((category) => ({
      category,
      members: data.filter((member) => member.category === category),
    })).filter((group) => group.members.length > 0);
  }, [data]);

  /**
   * Move a member within its own group.
   *
   * The whole roster's order is submitted, not just the group's, because
   * `sort_order` is a single sequence across the table.
   */
  const move = useCallback(
    async (member: TeamMemberAdmin, direction: -1 | 1) => {
      if (!data) return;
      const group = data.filter((item) => item.category === member.category);
      const index = group.findIndex((item) => item.id === member.id);
      const target = index + direction;
      if (target < 0 || target >= group.length) return;

      const reordered = [...group];
      const [moved] = reordered.splice(index, 1);
      if (moved) reordered.splice(target, 0, moved);

      const others = data.filter((item) => item.category !== member.category);
      const ids = [...reordered, ...others]
        .sort(
          (a, b) =>
            TEAM_CATEGORY_ORDER.indexOf(a.category) - TEAM_CATEGORY_ORDER.indexOf(b.category),
        )
        .map((item) => item.id);

      const result = await reorder(ids);
      if (result) reload();
    },
    [data, reorder, reload],
  );

  const onDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await remove(deleting.id);
    if (result) {
      setToast('Member removed');
      setDeleting(null);
      reload();
    }
  }, [deleting, remove, reload]);

  return (
    <>
      <AdminHeader
        title="Team"
        count={data?.length}
        description="The roster, grouped the way it is published. Use the arrows to change the order cards appear in."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            Add member
          </button>
        }
      />

      <ContentFileNote file="content/team.yaml" />

      {loading && !data && <PageLoader label="Loading the roster" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="No team members yet"
          description="Add them here, or list them in content/team.yaml and run just content-import."
        />
      )}

      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.category} aria-labelledby={`group-${group.category}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <h2 id={`group-${group.category}`} className="font-semibold">
                {TEAM_CATEGORY_LABELS[group.category]}
              </h2>
              <span className="chip tabular">{group.members.length}</span>
            </div>

            <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {group.members.map((member, index) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <ReorderControls
                    label={member.name}
                    onUp={() => move(member, -1)}
                    onDown={() => move(member, 1)}
                    disabledUp={index === 0}
                    disabledDown={index === group.members.length - 1}
                  />

                  <Avatar src={member.photo} name={member.name} size="size-10" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-strong">
                      {member.name}
                      {!member.is_active && (
                        <span className="ml-2 font-mono text-[0.625rem] text-faint uppercase">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">{member.position ?? '—'}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(member)}
                      className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-accent"
                      aria-label={`Edit ${member.name}`}
                      title="Edit"
                    >
                      <EditIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(member)}
                      className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--color-crimson-400)]"
                      aria-label={`Remove ${member.name}`}
                      title="Remove"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {(creating || editing) && (
        <MemberEditor
          member={editing}
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
        note="To keep the record but hide them from the site, edit them and switch Active off instead."
      />

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
