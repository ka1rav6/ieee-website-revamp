/**
 * /events - upcoming events as cards, the archive as a dated list.
 *
 * The branch has run dozens of events since 2021. Showing all of them as
 * cards would be a wall of posters, so anything in the past is a list that
 * reads as a history, grouped by year.
 */

import { useMemo, useState } from 'react';
import { publicApi } from '@/api/endpoints';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { getYear } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { PageHeader, Section } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { EventCard, EventRow } from '@/components/cards/EventCard';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/States';
import { CalendarIcon, CloseIcon, SearchIcon } from '@/components/ui/Icons';
import type { SiteEvent } from '@/types/api';

/** High enough to hold the whole archive in one request. */
const PER_PAGE = 100;

function groupByYear(events: SiteEvent[]): Array<{ year: number | null; events: SiteEvent[] }> {
  const buckets = new Map<number | null, SiteEvent[]>();
  for (const event of events) {
    const year = getYear(event.event_date);
    const bucket = buckets.get(year);
    if (bucket) bucket.push(event);
    else buckets.set(year, [event]);
  }
  return (
    [...buckets.entries()]
      .map(([year, items]) => ({ year, events: items }))
      // Undated events sort last.
      .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
  );
}

export default function EventsPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim(), 300);

  const { data, error, loading, reload } = useAsync(
    (signal) => publicApi.events({ per_page: PER_PAGE, search: search || null }, signal),
    [search],
  );

  const { upcoming, past } = useMemo(() => {
    const events = data?.items ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isFuture = (event: SiteEvent) => {
      if (!event.event_date) return false;
      const date = new Date(event.event_date);
      return date >= today;
    };

    return {
      // The API returns newest first; upcoming reads better soonest first.
      upcoming: events.filter(isFuture).reverse(),
      past: events.filter((event) => !isFuture(event)),
    };
  }, [data]);

  const archive = useMemo(() => groupByYear(past), [past]);
  const isSearching = search.length > 0;

  return (
    <>
      <Seo
        title="Events"
        description="Workshops, talks, hackathons, cryptic hunts and competitions run by the IEEE student branch at IIIT Delhi."
        canonicalPath="/events"
      />

      <PageHeader
        eyebrow="Events"
        title="Everything the branch has run"
        description="Cryptic hunts, hardware hackathons, coding duels, typing contests, speaker sessions and workshops - going back to 2021."
      >
        <div className="relative mt-7 max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search events"
            aria-label="Search events"
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
        <div className="shell space-y-16">
          {loading && !data && <SkeletonGrid count={6} />}

          {error && !data && <ErrorState error={error} onRetry={reload} />}

          {data && data.items.length === 0 && (
            <EmptyState
              icon={<CalendarIcon className="size-5" />}
              title={isSearching ? `Nothing matches "${search}"` : 'No events published yet'}
              description={
                isSearching
                  ? 'Try a shorter search, or clear it to see the whole archive.'
                  : 'Events appear here once they are added in the dashboard.'
              }
              action={
                isSearching ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSearchInput('')}
                  >
                    Clear search
                  </button>
                ) : undefined
              }
            />
          )}

          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming-events" className="space-y-8">
              <Reveal>
                <h2 id="upcoming-events" className="fluid-subheading font-semibold">
                  Coming up
                </h2>
              </Reveal>
              <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((event) => (
                  <StaggerItem as="li" key={event.slug}>
                    <EventCard event={event} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          {archive.length > 0 && (
            <section aria-labelledby="past-events" className="space-y-10">
              <Reveal className="flex flex-wrap items-baseline gap-3">
                <h2 id="past-events" className="fluid-subheading font-semibold">
                  {isSearching ? 'Results' : 'Archive'}
                </h2>
                <span className="chip tabular">
                  {past.length} {past.length === 1 ? 'event' : 'events'}
                </span>
              </Reveal>

              {archive.map((group) => (
                <div key={group.year ?? 'undated'} className="space-y-1">
                  <h3 className="sticky top-[var(--header-height)] z-10 -mx-2 bg-[color-mix(in_oklab,var(--surface-base)_90%,transparent)] px-2 py-3 font-mono text-xs tracking-[0.14em] text-faint uppercase backdrop-blur-sm">
                    {group.year ?? 'Undated'}
                  </h3>
                  <ul>
                    {group.events.map((event) => (
                      <li key={event.slug}>
                        <EventRow event={event} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      </Section>
    </>
  );
}
