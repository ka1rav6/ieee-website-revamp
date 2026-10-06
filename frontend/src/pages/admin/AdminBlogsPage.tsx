/**
 * Blog management: list, editor, publish toggle and delete.
 *
 * The editor writes Markdown, which is what the content files hold too, so
 * an article written here exports cleanly and one written in a file imports
 * cleanly.
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
import {
  ArrowUpRightIcon,
  BookIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/ui/Icons';
import type { BlogPostAdmin, BlogPostWrite } from '@/types/api';

type Filter = 'all' | 'published' | 'draft';

const EMPTY_POST: BlogPostWrite = {
  title: '',
  body: '',
  author_name: '',
  author_subtitle: '',
  excerpt: '',
  cover_image: null,
  cover_image_alt: '',
  category_slug: null,
  tags: [],
  is_published: false,
  is_featured: false,
  published_at: null,
};

function PostEditor({
  post,
  categories,
  onClose,
  onSaved,
}: {
  post: BlogPostAdmin | null;
  categories: Array<{ slug: string; name: string }>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<BlogPostWrite>(EMPTY_POST);
  const [tagsText, setTagsText] = useState('');

  // Load the post into the form whenever the editor opens on a new one.
  useEffect(() => {
    if (post) {
      setValues({
        title: post.title,
        body: post.body,
        slug: post.slug,
        excerpt: post.excerpt ?? '',
        cover_image: post.cover_image,
        cover_image_alt: post.cover_image_alt ?? '',
        author_name: post.author_name,
        author_subtitle: post.author_subtitle ?? '',
        author_image: post.author_image,
        category_slug: post.category_slug,
        is_published: post.is_published,
        is_featured: post.is_featured,
        published_at: post.published_at,
      });
      setTagsText(post.tags.map((tag) => tag.name).join(', '));
    } else {
      setValues(EMPTY_POST);
      setTagsText('');
    }
  }, [post]);

  const [save, { submitting, error, fieldErrors }] = useMutation(async (payload: BlogPostWrite) =>
    post ? adminApi.blogs.update(post.id, payload) : adminApi.blogs.create(payload),
  );

  const update = useCallback(<K extends keyof BlogPostWrite>(key: K, value: BlogPostWrite[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const payload: BlogPostWrite = {
        ...values,
        tags: tagsText
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        excerpt: values.excerpt?.trim() || null,
        author_subtitle: values.author_subtitle?.trim() || null,
        cover_image_alt: values.cover_image_alt?.trim() || null,
        published_at: values.published_at || null,
      };
      // A new post derives its slug from the title; sending an empty string
      // would be rejected as an explicit, unusable slug.
      if (!post) delete payload.slug;

      const result = await save(payload);
      if (result) {
        onSaved(post ? 'Article updated' : 'Article created');
        onClose();
      }
    },
    [values, tagsText, post, save, onSaved, onClose],
  );

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={post ? 'Edit article' : 'New article'}
      description="The body is Markdown. It is rendered and sanitised on the server before it reaches a reader."
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
          <button type="submit" form="post-form" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : post ? 'Save changes' : 'Create article'}
          </button>
        </>
      }
    >
      <form id="post-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <Labelled label="Title" error={fieldErrors.title}>
          {(props) => (
            <input
              {...props}
              type="text"
              required
              maxLength={300}
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
            />
          )}
        </Labelled>

        {post && (
          <Labelled
            label="URL slug"
            error={fieldErrors.slug}
            hint={`The article lives at /blogs/${values.slug ?? post.slug}. Changing it breaks existing links.`}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={220}
                value={values.slug ?? ''}
                onChange={(event) => update('slug', event.target.value)}
                className={cx(props.className, 'font-mono text-xs')}
              />
            )}
          </Labelled>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Author" error={fieldErrors.author_name}>
            {(props) => (
              <input
                {...props}
                type="text"
                required
                maxLength={160}
                value={values.author_name}
                onChange={(event) => update('author_name', event.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Author subtitle" optional hint="e.g. B.Tech., M.Tech.">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={160}
                value={values.author_subtitle ?? ''}
                onChange={(event) => update('author_subtitle', event.target.value)}
              />
            )}
          </Labelled>

          <Labelled label="Category" optional>
            {(props) => (
              <select
                {...props}
                value={values.category_slug ?? ''}
                onChange={(event) => update('category_slug', event.target.value || null)}
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </Labelled>

          <Labelled label="Publication date" optional error={fieldErrors.published_at}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={values.published_at ?? ''}
                onChange={(event) => update('published_at', event.target.value || null)}
              />
            )}
          </Labelled>
        </div>

        <Labelled
          label="Tags"
          optional
          hint="Comma separated. New tags are created as you use them."
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="web3, blockchain"
            />
          )}
        </Labelled>

        <ImagePicker
          label="Cover image"
          value={values.cover_image ?? null}
          onChange={(url) => update('cover_image', url)}
        />

        {values.cover_image && (
          <Labelled
            label="Cover image description"
            hint="Describes the image for readers using a screen reader."
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={300}
                value={values.cover_image_alt ?? ''}
                onChange={(event) => update('cover_image_alt', event.target.value)}
              />
            )}
          </Labelled>
        )}

        <Labelled
          label="Excerpt"
          optional
          error={fieldErrors.excerpt}
          hint="Shown on cards and in search results. Derived from the body if left empty."
        >
          {(props) => (
            <textarea
              {...props}
              rows={2}
              maxLength={600}
              value={values.excerpt ?? ''}
              onChange={(event) => update('excerpt', event.target.value)}
              className={cx(props.className, 'resize-y')}
            />
          )}
        </Labelled>

        <Labelled label="Body (Markdown)" error={fieldErrors.body}>
          {(props) => (
            <textarea
              {...props}
              rows={16}
              value={values.body}
              onChange={(event) => update('body', event.target.value)}
              placeholder={'## A heading\n\nSome prose, with a [link](https://example.com).'}
              className={cx(props.className, 'resize-y font-mono text-xs leading-relaxed')}
            />
          )}
        </Labelled>

        <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <Toggle
            label="Published"
            description="Only published articles are visible on the public site."
            checked={values.is_published ?? false}
            onChange={(checked) => update('is_published', checked)}
          />
          <Toggle
            label="Featured"
            description="Featured articles are promoted on the landing page."
            checked={values.is_featured ?? false}
            onChange={(checked) => update('is_featured', checked)}
          />
        </div>

        <MutationError error={error} />
      </form>
    </Modal>
  );
}

export default function AdminBlogsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim(), 300);

  const [editing, setEditing] = useState<BlogPostAdmin | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BlogPostAdmin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data: categories } = useAsync((signal) => adminApi.blogs.categories(signal), []);

  const { data, error, loading, reload } = useAsync(
    (signal) =>
      adminApi.blogs.list(
        {
          per_page: 100,
          published: filter === 'all' ? null : filter === 'published',
          search: search || undefined,
        },
        signal,
      ),
    [filter, search],
  );

  const [togglePublish, { submitting: publishing }] = useMutation(adminApi.blogs.setPublished);
  const [remove, { submitting: removing }] = useMutation(adminApi.blogs.remove);

  const onTogglePublish = useCallback(
    async (post: BlogPostAdmin) => {
      const result = await togglePublish(post.id, !post.is_published);
      if (result) {
        setToast(result.is_published ? 'Article published' : 'Article unpublished');
        reload();
      }
    },
    [togglePublish, reload],
  );

  const onDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await remove(deleting.id);
    if (result) {
      setToast('Article deleted');
      setDeleting(null);
      reload();
    }
  }, [deleting, remove, reload]);

  const posts = data?.items ?? [];

  return (
    <>
      <AdminHeader
        title="Blog"
        count={data?.total}
        description="Write, edit and publish articles. Drafts stay invisible to the public until you publish them."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            New article
          </button>
        }
      />

      <ContentFileNote file="content/blogs/*.md" />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5" role="group" aria-label="Filter by state">
          {(['all', 'published', 'draft'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cx('chip chip-button capitalize', filter === value && 'chip-active')}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by title or author"
            aria-label="Search articles"
            className="field pl-9"
          />
        </div>
      </div>

      {loading && !data && <PageLoader label="Loading articles" />}

      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && posts.length === 0 && (
        <EmptyState
          icon={<BookIcon className="size-5" />}
          title={search || filter !== 'all' ? 'Nothing matches' : 'No articles yet'}
          description={
            search || filter !== 'all'
              ? 'Try a different filter or search.'
              : 'Write the first one, or drop a Markdown file into content/blogs/ and run just content-import.'
          }
          action={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New article
            </button>
          }
        />
      )}

      {posts.length > 0 && (
        <AdminTable
          head={
            <tr>
              <Th>Article</Th>
              <Th>Category</Th>
              <Th>State</Th>
              <Th>Updated</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          }
        >
          {posts.map((post) => (
            <tr key={post.slug} className="transition-colors hover:bg-[var(--surface-sunken)]">
              <Td>
                <div className="min-w-0 max-w-sm">
                  <p className="truncate font-medium text-strong">{post.title}</p>
                  <p className="truncate text-xs text-muted">
                    {post.author_name}
                    {post.is_featured && <span className="ml-2 text-emphasis">Featured</span>}
                  </p>
                </div>
              </Td>
              <Td>
                <span className="text-xs text-muted">{post.category?.name ?? '—'}</span>
              </Td>
              <Td>
                <StatusPill tone={post.is_published ? 'live' : 'draft'}>
                  {post.is_published ? 'Live' : 'Draft'}
                </StatusPill>
              </Td>
              <Td>
                <span className="font-mono text-xs text-faint">
                  {formatShortDate(post.updated_at)}
                </span>
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {post.is_published && (
                    <a
                      href={`/blogs/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-accent"
                      aria-label={`View ${post.title} on the site`}
                      title="View on the site"
                    >
                      <ArrowUpRightIcon className="size-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onTogglePublish(post)}
                    disabled={publishing}
                    className="btn btn-ghost btn-sm"
                  >
                    {post.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(post)}
                    className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-accent"
                    aria-label={`Edit ${post.title}`}
                    title="Edit"
                  >
                    <EditIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(post)}
                    className="grid size-8 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--color-crimson-400)]"
                    aria-label={`Delete ${post.title}`}
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
        <PostEditor
          post={editing}
          categories={categories ?? []}
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
        note="If this article also exists as a file in content/blogs/, delete that file too - otherwise the next content import will bring it back."
      />

      <SavedToast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
