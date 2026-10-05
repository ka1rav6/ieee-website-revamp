/**
 * /blogs/:slug - a single article.
 *
 * The reading experience is the point of this page: a measured column,
 * generous leading, a progress bar, and no sidebar competing with the text.
 * The body arrives as HTML already sanitised by the backend.
 */

import { Link, useParams } from 'react-router-dom';
import { publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useScrollProgress } from '@/hooks/useInteraction';
import { formatDate } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { Reveal } from '@/components/ui/Reveal';
import { Avatar, Image } from '@/components/ui/Media';
import { BlogCardCompact } from '@/components/cards/BlogCard';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { ArrowLeftIcon, ClockIcon, TagIcon } from '@/components/ui/Icons';
import { ArticleBody } from '@/components/ArticleBody';
import NotFoundPage from './NotFoundPage';

/** A thin bar showing how far through the article the reader is. */
function ReadingProgress() {
  const progress = useScrollProgress();

  return (
    <div
      className="fixed inset-x-0 top-[var(--header-height)] z-40 h-0.5 bg-transparent"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full origin-left bg-gradient-to-r from-brand to-accent"
        // A transform is cheaper to animate than a width, which would force
        // a layout on every scroll frame.
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

export default function BlogPostPage() {
  const { slug = '' } = useParams();
  const {
    data: post,
    error,
    loading,
    reload,
  } = useAsync((signal) => publicApi.blog(slug, signal), [slug]);

  if (loading && !post) return <PageLoader label="Loading article" />;

  // A missing or unpublished slug is genuinely a 404 for the reader.
  if (error?.isNotFound) return <NotFoundPage />;

  if (error && !post) {
    return (
      <div className="shell py-24">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  if (!post) return null;

  const published = formatDate(post.published_at);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? undefined,
    datePublished: post.published_at ?? undefined,
    author: { '@type': 'Person', name: post.author_name },
    publisher: { '@type': 'Organization', name: 'IEEE Student Branch, IIIT Delhi' },
    image: post.cover_image ?? undefined,
    articleSection: post.category?.name,
    keywords: post.tags.map((tag) => tag.name).join(', ') || undefined,
  };

  return (
    <>
      <Seo
        title={post.title}
        description={post.excerpt ?? undefined}
        image={post.cover_image}
        type="article"
        canonicalPath={`/blogs/${post.slug}`}
        publishedTime={post.published_at}
        author={post.author_name}
        jsonLd={jsonLd}
      />

      <ReadingProgress />

      <article className="pt-[calc(var(--header-height)+2.5rem)] pb-20">
        <header className="shell-narrow">
          <Link
            to="/blogs"
            className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wide text-muted transition-colors hover:text-accent"
          >
            <ArrowLeftIcon className="size-3.5" />
            All articles
          </Link>

          <div className="mt-7 space-y-5">
            {post.category && (
              <Link
                to={`/blogs?category=${post.category.slug}`}
                className="eyebrow eyebrow-plain transition-colors hover:text-accent"
              >
                {post.category.name}
              </Link>
            )}

            <h1 className="fluid-heading font-bold md:text-5xl">{post.title}</h1>

            {post.excerpt && <p className="text-lg text-muted md:text-xl">{post.excerpt}</p>}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--border-subtle)] pt-5">
              <div className="flex items-center gap-2.5">
                <Avatar src={post.author_image} name={post.author_name} size="size-9" />
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-strong">{post.author_name}</p>
                  {post.author_subtitle && (
                    <p className="text-xs text-faint">{post.author_subtitle}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 font-mono text-[0.6875rem] tracking-wide text-faint">
                {published && <time dateTime={post.published_at ?? undefined}>{published}</time>}
                {post.reading_minutes ? (
                  <span className="inline-flex items-center gap-1">
                    <ClockIcon className="size-3.5" />
                    {post.reading_minutes} min read
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {post.cover_image && (
          <Reveal className="shell mt-10">
            <Image
              src={post.cover_image}
              alt={post.cover_image_alt ?? ''}
              aspect="aspect-16/9"
              loading="eager"
              className="mx-auto max-w-5xl rounded-[var(--radius-card)] border border-[var(--border-subtle)]"
            />
          </Reveal>
        )}

        <div className="shell-narrow mt-12">
          <ArticleBody html={post.body_html} />

          {post.tags.length > 0 && (
            <footer className="mt-12 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-7">
              <TagIcon className="size-4 text-faint" aria-hidden="true" />
              <h2 className="sr-only">Tags</h2>
              {post.tags.map((tag) => (
                <Link key={tag.slug} to={`/blogs?tag=${tag.slug}`} className="chip chip-button">
                  {tag.name}
                </Link>
              ))}
            </footer>
          )}
        </div>
      </article>

      {post.related.length > 0 && (
        <section
          aria-labelledby="related-reading"
          className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] py-16"
        >
          <div className="shell-narrow space-y-8">
            <h2 id="related-reading" className="fluid-subheading font-semibold">
              Read next
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {post.related.map((related) => (
                <li key={related.slug}>
                  <BlogCardCompact post={related} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
