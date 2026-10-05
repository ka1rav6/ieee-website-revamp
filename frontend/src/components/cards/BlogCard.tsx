/** Blog cards: the standard grid card and the wide featured variant. */

import { Link } from 'react-router-dom';
import { useSpotlight } from '@/hooks/useInteraction';
import { cx, formatDate } from '@/utils/format';
import { Avatar, Image } from '@/components/ui/Media';
import { ArrowRightIcon, ClockIcon } from '@/components/ui/Icons';
import type { BlogPostSummary } from '@/types/api';

function Meta({ post }: { post: BlogPostSummary }) {
  const published = formatDate(post.published_at);
  return (
    <div className="flex items-center gap-2 font-mono text-[0.6875rem] tracking-wide text-faint">
      {/* Historical posts carry no date, so the separator only appears when
          there is something on both sides of it. */}
      {published && <time dateTime={post.published_at ?? undefined}>{published}</time>}
      {published && post.reading_minutes ? <span aria-hidden="true">·</span> : null}
      {post.reading_minutes ? (
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="size-3" />
          {post.reading_minutes} min read
        </span>
      ) : null}
    </div>
  );
}

function Byline({ post }: { post: BlogPostSummary }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar src={post.author_image} name={post.author_name} size="size-8" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-default">{post.author_name}</p>
        {post.author_subtitle && (
          <p className="truncate text-xs text-faint">{post.author_subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function BlogCard({ post, className }: { post: BlogPostSummary; className?: string }) {
  const { ref, onPointerMove } = useSpotlight<HTMLDivElement>();

  return (
    <article
      ref={ref}
      onPointerMove={onPointerMove}
      className={cx(
        'card card-interactive spotlight group flex h-full flex-col overflow-hidden',
        className,
      )}
    >
      <Link to={`/blogs/${post.slug}`} className="flex h-full flex-col focus-visible:outline-none">
        <div className="relative overflow-hidden">
          <Image
            src={post.cover_image}
            alt={post.cover_image_alt ?? ''}
            aspect="aspect-16/10"
            className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
          />
          {post.category && (
            <span className="absolute top-3 left-3 rounded-full bg-[color-mix(in_oklab,var(--surface-base)_82%,transparent)] px-2.5 py-1 font-mono text-[0.625rem] tracking-wider text-strong uppercase backdrop-blur-sm">
              {post.category.name}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <Meta post={post} />
          <h3 className="text-lg leading-snug font-semibold transition-colors duration-200 group-hover:text-accent">
            {post.title}
          </h3>
          {post.excerpt && <p className="line-clamp-3 flex-1 text-sm text-muted">{post.excerpt}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
            <Byline post={post} />
            <ArrowRightIcon className="size-4 shrink-0 text-faint transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent" />
          </div>
        </div>
      </Link>
    </article>
  );
}

/**
 * The lead article, given a two-column layout so it reads as the most
 * important thing on the page without needing a louder colour.
 */
export function FeaturedBlogCard({ post }: { post: BlogPostSummary }) {
  const { ref, onPointerMove } = useSpotlight<HTMLDivElement>();

  return (
    <article
      ref={ref}
      onPointerMove={onPointerMove}
      className="card card-interactive spotlight group overflow-hidden"
    >
      <Link
        to={`/blogs/${post.slug}`}
        className="grid gap-0 md:grid-cols-5 focus-visible:outline-none"
      >
        <div className="relative overflow-hidden md:col-span-2">
          <Image
            src={post.cover_image}
            alt={post.cover_image_alt ?? ''}
            aspect="aspect-16/10 md:aspect-auto md:h-full"
            className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04] md:h-full"
          />
        </div>

        <div className="flex flex-col gap-4 p-6 md:col-span-3 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip border-accent text-accent">Featured</span>
            {post.category && <span className="chip">{post.category.name}</span>}
          </div>

          <h3 className="fluid-subheading font-semibold transition-colors duration-200 group-hover:text-accent">
            {post.title}
          </h3>

          {post.excerpt && <p className="line-clamp-3 text-muted">{post.excerpt}</p>}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-5">
            <Byline post={post} />
            <Meta post={post} />
          </div>
        </div>
      </Link>
    </article>
  );
}

/** A compact row, used for "related reading" beneath an article. */
export function BlogCardCompact({ post }: { post: BlogPostSummary }) {
  return (
    <article className="group">
      <Link to={`/blogs/${post.slug}`} className="flex gap-4">
        <Image
          src={post.cover_image}
          alt=""
          aspect="aspect-square"
          className="w-20 shrink-0 rounded-lg transition-transform duration-500 group-hover:scale-[1.05]"
        />
        <div className="min-w-0 space-y-1.5">
          {post.category && (
            <p className="font-mono text-[0.625rem] tracking-wider text-accent uppercase">
              {post.category.name}
            </p>
          )}
          <h4 className="line-clamp-2 text-sm leading-snug font-semibold transition-colors group-hover:text-accent">
            {post.title}
          </h4>
          <Meta post={post} />
        </div>
      </Link>
    </article>
  );
}
