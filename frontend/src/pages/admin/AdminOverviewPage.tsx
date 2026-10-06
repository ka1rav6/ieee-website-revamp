/**
 * The dashboard landing screen: what is on the site, what needs attention,
 * and how to change things without opening the dashboard at all.
 */

import { Link } from 'react-router-dom';
import { adminApi, publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { formatShortDate } from '@/utils/format';
import { AdminHeader } from './components/AdminUi';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import {
  ArrowRightIcon,
  BookIcon,
  BuildingIcon,
  CalendarIcon,
  InboxIcon,
  UsersIcon,
} from '@/components/ui/Icons';

function StatCard({
  label,
  value,
  to,
  icon,
}: {
  label: string;
  value: number | undefined;
  to: string;
  icon: React.ReactNode;
}) {
  return (
    <Link to={to} className="card card-interactive group flex items-center gap-4 p-5">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-accent"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {value === undefined ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <p className="font-display text-2xl font-bold text-strong tabular">{value}</p>
        )}
        <p className="font-mono text-[0.625rem] tracking-[0.1em] text-muted uppercase">{label}</p>
      </div>
      <ArrowRightIcon className="size-4 shrink-0 text-faint transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent" />
    </Link>
  );
}

export default function AdminOverviewPage() {
  const { data: stats, error, reload } = useAsync((signal) => publicApi.stats(signal), []);
  const { data: drafts } = useAsync(
    (signal) => adminApi.blogs.list({ published: false, per_page: 5 }, signal),
    [],
  );
  const { data: inbox } = useAsync(
    (signal) => adminApi.submissions.list({ status: 'new', per_page: 5 }, signal),
    [],
  );

  return (
    <>
      <AdminHeader
        title="Overview"
        description="What is currently live on the site, and anything waiting on you."
      />

      {error && <ErrorState error={error} onRetry={reload} className="mb-8" />}

      <section aria-labelledby="site-contents" className="mb-10">
        <h2 id="site-contents" className="sr-only">
          Site contents
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Published articles"
            value={stats?.blog_posts}
            to="/admin/blogs"
            icon={<BookIcon className="size-5" />}
          />
          <StatCard
            label="Events"
            value={stats?.events}
            to="/admin/events"
            icon={<CalendarIcon className="size-5" />}
          />
          <StatCard
            label="Team members"
            value={stats?.members}
            to="/admin/team"
            icon={<UsersIcon className="size-5" />}
          />
          <StatCard
            label="Alumni"
            value={stats?.alumni}
            to="/admin/alumni"
            icon={<UsersIcon className="size-5" />}
          />
          <StatCard
            label="Collaborations"
            value={stats?.collaborations}
            to="/admin/collaborations"
            icon={<BuildingIcon className="size-5" />}
          />
          <StatCard
            label="Unread messages"
            value={inbox?.total}
            to="/admin/submissions"
            icon={<InboxIcon className="size-5" />}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="unread-messages" className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="unread-messages" className="font-semibold">
              Unread messages
            </h2>
            <Link to="/admin/submissions" className="text-sm font-semibold text-accent">
              Open inbox
            </Link>
          </div>

          {inbox && inbox.items.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="size-5" />}
              title="Nothing unread"
              description="New enquiries from the contact form land here."
              className="border-0 py-8"
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {(inbox?.items ?? []).map((submission) => (
                <li key={submission.id}>
                  <Link
                    to="/admin/submissions"
                    className="group flex items-center justify-between gap-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-strong">
                        {submission.subject || submission.name}
                      </span>
                      <span className="block truncate text-xs text-muted">{submission.email}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                      {formatShortDate(submission.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="draft-articles" className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="draft-articles" className="font-semibold">
              Drafts
            </h2>
            <Link to="/admin/blogs" className="text-sm font-semibold text-accent">
              Manage blog
            </Link>
          </div>

          {drafts && drafts.items.length === 0 ? (
            <EmptyState
              icon={<BookIcon className="size-5" />}
              title="No drafts"
              description="Unpublished articles show up here until you publish them."
              className="border-0 py-8"
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {(drafts?.items ?? []).map((post) => (
                <li key={post.slug}>
                  <Link
                    to="/admin/blogs"
                    className="group flex items-center justify-between gap-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-strong">
                        {post.title}
                      </span>
                      <span className="block truncate text-xs text-muted">{post.author_name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                      {formatShortDate(post.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="scripted-updates" className="card mt-6 space-y-3 p-5">
        <h2 id="scripted-updates" className="font-semibold">
          Updating content without the dashboard
        </h2>
        <p className="text-sm text-muted">
          Everything on this site is also stored as plain files under{' '}
          <code className="font-mono text-default">content/</code> - YAML for people, events and
          collaborations, Markdown for articles. Edit those and run one command; nothing here has to
          change.
        </p>
        <ul className="space-y-2 font-mono text-xs">
          {[
            ['just content-import', 'load content/ into the database'],
            ['just content-export', 'write the database back out to content/'],
            ['just content-check', 'preview what an import would change'],
          ].map(([command, description]) => (
            <li key={command} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <code className="rounded bg-[var(--surface-sunken)] px-2 py-1 text-accent">
                {command}
              </code>
              <span className="text-muted">{description}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
