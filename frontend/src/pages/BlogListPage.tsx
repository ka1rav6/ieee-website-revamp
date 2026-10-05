/**
 * /blogs - the blog index, with category filters, search and pagination.
 *
 * Filter state lives in the URL, so a filtered view can be linked, shared
 * and returned to with the back button.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '@/api/endpoints';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { cx } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { PageHeader, Section } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { BlogCard, FeaturedBlogCard } from '@/components/cards/BlogCard';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/States';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookIcon,
  CloseIcon,
  SearchIcon,
} from '@/components/ui/Icons';

const PER_PAGE = 9;

export default function BlogListPage() {
  const [params, setParams] = useSearchParams();

  const category = params.get('category');
  const tag = params.get('tag');
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const urlSearch = params.get('q') ?? '';

  // The input is local so typing stays responsive; the URL is updated once
  // the debounced value settles.
  const [searchInput, setSearchInput] = useState(urlSearch);
  const search = useDebounced(searchInput.trim(), 350);

  // Keep the box in step when the visitor navigates back to a filtered URL.
  useEffect(() => setSearchInput(urlSearch), [urlSearch]);

  useEffect(() => {
    if (search === urlSearch) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (search) next.set('q', search);
        else next.delete('q');
        // Any filter change starts from the first page.
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [search, urlSearch, setParams]);

  const { data: categories } = useAsync((signal) => publicApi.blogCategories(signal), []);

  const { data, error, loading, reload } = useAsync(
    (signal) =>
      publicApi.blogs({ page, per_page: PER_PAGE, category, tag, search: search || null }, signal),
    [page, category, tag, search],
  );

  const setFilter = useCallback(
    (key: 'category' | 'tag', value: string | null) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('page');
        return next;
      });
    },
    [setParams],
  );

  const goToPage = useCallback(
    (target: number) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (target <= 1) next.delete('page');
        else next.set('page', String(target));
        return next;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setParams],
  );

  const posts = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const isFiltered = Boolean(category || tag || search);

  // The lead card only earns its size on an unfiltered first page; inside a
  // filtered result set it would just make one arbitrary post look special.
  const showLead = !isFiltered && page === 1 && posts.length > 3;
  const lead = showLead ? posts[0] : undefined;
  const rest = showLead ? posts.slice(1) : posts;

  const activeCategory = categories?.find((item) => item.slug === category);

  return (
    <>
      <Seo
        title={activeCategory ? `${activeCategory.name} · Blog` : 'Blog'}
        description={
          activeCategory?.description ??
          'Members of the IEEE student branch at IIIT Delhi writing about technology, research and the industry.'
        }
        canonicalPath="/blogs"
      />

      <PageHeader
        eyebrow="Writing"
        title="The blog"
        description="Members writing about what they find interesting - spacesuits and semiconductors, 6G and autonomous cars, neuroscience and Web3."
      >
        <div className="relative mt-7 max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search articles"
            aria-label="Search articles"
            className="field pl-10"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded text-faint hover:text-strong"
              aria-label="Clear search"
            >
              <CloseIcon className="size-4" />
            </button>
          )}
        </div>
      </PageHeader>

      <Section compact>
        <div className="shell space-y-10">
          {categories && categories.length > 0 && (
            <Reveal>
              <div className="scroll-x no-scrollbar -mx-6 px-6">
                <ul className="flex w-max items-center gap-2" aria-label="Filter by category">
                  <li>
                    <button
                      type="button"
                      onClick={() => setFilter('category', null)}
                      aria-pressed={!category}
                      className={cx('chip chip-button', !category && 'chip-active')}
                    >
                      All posts
                    </button>
                  </li>
                  {categories.map((item) => (
                    <li key={item.slug}>
                      <button
                        type="button"
                        onClick={() => setFilter('category', item.slug)}
                        aria-pressed={category === item.slug}
                        className={cx('chip chip-button', category === item.slug && 'chip-active')}
                      >
                        {item.name}
                        <span className="tabular opacity-60">{item.post_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}

          {tag && (
            <Reveal className="flex items-center gap-2 text-sm text-muted">
              <span>
                Tagged <span className="font-medium text-strong">{tag}</span>
              </span>
              <button
                type="button"
                onClick={() => setFilter('tag', null)}
                className="chip chip-button"
              >
                Clear
                <CloseIcon className="size-3" />
              </button>
            </Reveal>
          )}

          {loading && !data && <SkeletonGrid count={6} />}

          {error && !data && <ErrorState error={error} onRetry={reload} />}

          {data && posts.length === 0 && (
            <EmptyState
              icon={<BookIcon className="size-5" />}
              title={isFiltered ? 'No articles match those filters' : 'No articles published yet'}
              description={
                isFiltered
                  ? 'Try a different category, or clear the filters to see everything.'
                  : 'Published articles appear here. Drafts stay private until the admin publishes them.'
              }
              action={
                isFiltered ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setParams(new URLSearchParams())}
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )}

          {lead && (
            <Reveal>
              <FeaturedBlogCard post={lead} />
            </Reveal>
          )}

          {rest.length > 0 && (
            <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <StaggerItem as="li" key={post.slug}>
                  <BlogCard post={post} />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-8"
              aria-label="Pagination"
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                <ArrowLeftIcon className="size-4" />
                Previous
              </button>

              <p className="font-mono text-xs tracking-wide text-muted tabular">
                Page {page} of {totalPages}
              </p>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
              >
                Next
                <ArrowRightIcon className="size-4" />
              </button>
            </nav>
          )}
        </div>
      </Section>
    </>
  );
}
