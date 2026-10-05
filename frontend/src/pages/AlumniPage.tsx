/**
 * /alumni - former members, searchable and filterable by graduation year.
 *
 * Only what the branch publishes is shown: name, year, degree, current role
 * and organisation, and whatever public profiles they chose to share. There
 * is no personal contact detail on this page.
 */

import { useMemo, useState } from 'react';
import { publicApi } from '@/api/endpoints';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { cx } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { PageHeader, Section } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { AlumniCard } from '@/components/cards/PersonCard';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/States';
import { CloseIcon, SearchIcon, UsersIcon } from '@/components/ui/Icons';

export default function AlumniPage() {
  const [searchInput, setSearchInput] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const search = useDebounced(searchInput.trim(), 300);

  // Fetched unfiltered and narrowed on the client: the full list is a few
  // dozen rows, so filtering locally is instant and avoids a request per
  // keystroke.
  const { data, error, loading, reload } = useAsync((signal) => publicApi.alumni({}, signal), []);

  const years = useMemo(() => {
    const present = new Set<number>();
    for (const alumnus of data ?? []) {
      if (alumnus.graduation_year) present.add(alumnus.graduation_year);
    }
    return [...present].sort((a, b) => b - a);
  }, [data]);

  const visible = useMemo(() => {
    let results = data ?? [];
    if (year !== null) {
      results = results.filter((alumnus) => alumnus.graduation_year === year);
    }
    if (search) {
      const needle = search.toLowerCase();
      results = results.filter((alumnus) =>
        [
          alumnus.name,
          alumnus.current_organization,
          alumnus.current_role,
          alumnus.degree,
          alumnus.branch,
        ]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      );
    }
    return results;
  }, [data, year, search]);

  const isFiltered = Boolean(search || year !== null);

  return (
    <>
      <Seo
        title="Alumni"
        description="Former members of the IEEE student branch at IIIT Delhi, and where they went on to work."
        canonicalPath="/alumni"
      />

      <PageHeader
        eyebrow="Alumni"
        title="Where members end up"
        description="People who ran this branch and went on to Google, Microsoft, Adobe, Qualcomm, LinkedIn, MathWorks, KTH and their own companies."
      >
        <div className="relative mt-7 max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, company or role"
            aria-label="Search alumni"
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
          {years.length > 1 && (
            <Reveal>
              <div className="scroll-x no-scrollbar -mx-6 px-6">
                <ul
                  className="flex w-max items-center gap-2"
                  aria-label="Filter by graduation year"
                >
                  <li>
                    <button
                      type="button"
                      onClick={() => setYear(null)}
                      aria-pressed={year === null}
                      className={cx('chip chip-button', year === null && 'chip-active')}
                    >
                      All years
                    </button>
                  </li>
                  {years.map((value) => (
                    <li key={value}>
                      <button
                        type="button"
                        onClick={() => setYear(value)}
                        aria-pressed={year === value}
                        className={cx('chip chip-button tabular', year === value && 'chip-active')}
                      >
                        {value}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}

          {data && (
            <p className="font-mono text-xs tracking-wide text-faint tabular" aria-live="polite">
              {visible.length} {visible.length === 1 ? 'person' : 'people'}
              {isFiltered && data.length !== visible.length ? ` of ${data.length}` : ''}
            </p>
          )}

          {loading && !data && <SkeletonGrid count={6} className="lg:grid-cols-2" />}

          {error && !data && <ErrorState error={error} onRetry={reload} />}

          {data && visible.length === 0 && (
            <EmptyState
              icon={<UsersIcon className="size-5" />}
              title={isFiltered ? 'Nobody matches those filters' : 'No alumni listed yet'}
              description={
                isFiltered
                  ? 'Try a different year or a shorter search.'
                  : 'Alumni appear here once they are added in the dashboard.'
              }
              action={
                isFiltered ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSearchInput('');
                      setYear(null);
                    }}
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )}

          {visible.length > 0 && (
            <Stagger as="ul" step={0.035} className="grid gap-5 md:grid-cols-2">
              {visible.map((alumnus) => (
                <StaggerItem as="li" key={alumnus.slug}>
                  <AlumniCard alumnus={alumnus} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </Section>
    </>
  );
}
