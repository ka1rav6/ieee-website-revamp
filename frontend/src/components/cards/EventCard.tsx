/** Event cards, for the landing page and the events archive. */

import { useSpotlight } from '@/hooks/useInteraction';
import { cx, formatDate, getYear, isUpcoming } from '@/utils/format';
import { Image } from '@/components/ui/Media';
import { ArrowUpRightIcon, CalendarIcon, MapPinIcon } from '@/components/ui/Icons';
import type { SiteEvent } from '@/types/api';

function UpcomingBadge({ date }: { date: string | null }) {
  if (!isUpcoming(date)) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-signal-400)_16%,transparent)] px-2.5 py-1 font-mono text-[0.625rem] tracking-wider text-[var(--color-signal-400)] uppercase">
      {/* A dot plus the word, so the status does not rely on colour alone. */}
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      Upcoming
    </span>
  );
}

export function EventCard({ event, className }: { event: SiteEvent; className?: string }) {
  const { ref, onPointerMove } = useSpotlight<HTMLElement>();
  const date = formatDate(event.event_date);

  return (
    <article
      ref={ref}
      onPointerMove={onPointerMove}
      className={cx(
        'card card-interactive spotlight group flex h-full flex-col overflow-hidden',
        className,
      )}
    >
      <div className="relative overflow-hidden">
        <Image
          src={event.poster}
          alt={event.poster ? `${event.title} poster` : ''}
          aspect="aspect-4/3"
          className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
        />
        <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
          <UpcomingBadge date={event.event_date} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[0.6875rem] tracking-wide text-faint">
          {date && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              <time dateTime={event.event_date ?? undefined}>{date}</time>
            </span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon className="size-3.5" />
              {event.location}
            </span>
          )}
        </div>

        <h3 className="text-base leading-snug font-semibold">{event.title}</h3>

        {event.description && (
          <p className="line-clamp-3 flex-1 text-sm text-muted">{event.description}</p>
        )}

        {event.registration_url && isUpcoming(event.event_date) && (
          <a
            href={event.registration_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            Register
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * A dense list row for the events archive.
 *
 * Forty-three events in a card grid is a wall; as a dated list it reads as
 * a history, which is what an archive is for.
 */
export function EventRow({ event }: { event: SiteEvent }) {
  const date = formatDate(event.event_date);
  const year = getYear(event.event_date);

  return (
    <article className="group grid gap-4 border-b border-[var(--border-subtle)] py-6 sm:grid-cols-[7rem_1fr] sm:gap-6 md:grid-cols-[9rem_10rem_1fr]">
      <div className="flex items-baseline gap-2 sm:flex-col sm:gap-1">
        <span className="font-display text-2xl font-semibold text-strong tabular">
          {year ?? '—'}
        </span>
        {date && (
          <time
            dateTime={event.event_date ?? undefined}
            className="font-mono text-[0.6875rem] tracking-wide text-faint"
          >
            {date}
          </time>
        )}
      </div>

      <Image
        src={event.poster}
        alt={event.poster ? `${event.title} poster` : ''}
        aspect="aspect-4/3"
        className="hidden rounded-lg md:block"
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{event.title}</h3>
          <UpcomingBadge date={event.event_date} />
        </div>
        {event.description && <p className="max-w-2xl text-sm text-muted">{event.description}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {event.location && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] text-faint">
              <MapPinIcon className="size-3.5" />
              {event.location}
            </span>
          )}
          {event.registration_url && isUpcoming(event.event_date) && (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent"
            >
              Register
              <ArrowUpRightIcon className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
