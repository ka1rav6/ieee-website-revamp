/**
 * /ieee-day - the branch's IEEE Day page, with one edition per year.
 *
 * Every band here is driven by `content/ieee-day.yaml` (or the dashboard),
 * and each one renders only when it has content. A new edition can therefore
 * start as a theme and a date and grow into stats, highlights and a gallery
 * without the page ever looking half-finished.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { cx, formatDate } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { Image } from '@/components/ui/Media';
import { EventCard } from '@/components/cards/EventCard';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { ArrowUpRightIcon, CalendarIcon, SparkIcon } from '@/components/ui/Icons';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import type { IeeeDayEdition } from '@/types/api';

/**
 * The hero for an edition.
 *
 * Visually distinct from the landing hero - a radial burst rather than a
 * circuit grid - while using the same tokens, so it reads as a different
 * occasion on the same site.
 */
function EditionHero({ edition }: { edition: IeeeDayEdition }) {
  const celebrated = formatDate(edition.celebrated_on);

  return (
    <header className="relative overflow-hidden pt-[calc(var(--header-height)+4rem)] pb-16 md:pt-[calc(var(--header-height)+6rem)] md:pb-24">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* Concentric rings, reading as a signal radiating outward. */}
        <svg
          viewBox="0 0 800 500"
          className="absolute inset-0 size-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" stroke="var(--accent)" strokeWidth="1">
            {[80, 150, 220, 290, 360, 430].map((radius, index) => (
              <circle
                key={radius}
                cx="640"
                cy="120"
                r={radius}
                opacity={0.16 - index * 0.02}
                strokeDasharray={index % 2 === 0 ? undefined : '4 8'}
              />
            ))}
          </g>
        </svg>

        <div className="glow -top-20 right-10 size-96 bg-[var(--glow-secondary)]" />
        <div className="glow top-40 -left-20 size-80 bg-[var(--glow-primary)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--surface-base)]" />
      </div>

      <div className="shell relative">
        <div className="max-w-3xl space-y-5">
          <p className="eyebrow">
            IEEE Day {edition.year}
            {edition.is_current ? ' · Current edition' : ''}
          </p>

          <h1 className="fluid-display font-bold">
            <span className="text-gradient">{edition.theme ?? 'IEEE Day'}</span>
          </h1>

          {edition.tagline && <p className="fluid-subheading text-muted">{edition.tagline}</p>}

          {celebrated && (
            <p className="inline-flex items-center gap-2 font-mono text-sm text-default">
              <CalendarIcon className="size-4 text-accent" />
              <time dateTime={edition.celebrated_on ?? undefined}>{celebrated}</time>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

function EditionSwitcher({
  editions,
  activeYear,
}: {
  editions: IeeeDayEdition[];
  activeYear: number;
}) {
  if (editions.length < 2) return null;

  return (
    <nav aria-label="IEEE Day editions" className="shell -mt-4 pb-4">
      <ul className="scroll-x no-scrollbar flex w-max items-center gap-2">
        {editions.map((edition) => (
          <li key={edition.year}>
            <Link
              to={`/ieee-day/${edition.year}`}
              aria-current={edition.year === activeYear ? 'page' : undefined}
              className={cx(
                'chip chip-button tabular',
                edition.year === activeYear && 'chip-active',
              )}
            >
              {edition.year}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Stats({ edition }: { edition: IeeeDayEdition }) {
  if (edition.stats.length === 0) return null;

  return (
    <Section tone="sunken" compact divided>
      <div className="shell">
        <Reveal>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
            {edition.stats.map((stat) => (
              <div key={stat.label} className="space-y-1.5">
                <dd className="font-display text-4xl font-bold text-strong tabular md:text-5xl">
                  {stat.value}
                </dd>
                <dt className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </Section>
  );
}

function Highlights({ edition }: { edition: IeeeDayEdition }) {
  if (edition.highlights.length === 0) return null;

  return (
    <Section compact divided>
      <div className="shell space-y-12">
        <SectionHeader
          eyebrow="Highlights"
          title="What stood out"
          description={`Moments from IEEE Day ${edition.year}.`}
        />

        <Stagger as="ul" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {edition.highlights.map((highlight) => (
            <StaggerItem as="li" key={highlight.title}>
              <article className="card card-interactive h-full overflow-hidden">
                {highlight.image && <Image src={highlight.image} alt="" aspect="aspect-16/10" />}
                <div className="space-y-2 p-5">
                  <h3 className="font-semibold">{highlight.title}</h3>
                  {highlight.description && (
                    <p className="text-sm text-muted">{highlight.description}</p>
                  )}
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

function Gallery({ edition }: { edition: IeeeDayEdition }) {
  if (edition.gallery.length === 0) return null;

  return (
    <Section tone="sunken" compact divided>
      <div className="shell space-y-10">
        <SectionHeader eyebrow="Gallery" title={`IEEE Day ${edition.year} in pictures`} />

        {/* A masonry-ish grid: every third image spans two columns, which
            breaks the uniform rhythm without needing a layout library. */}
        <Stagger as="ul" step={0.04} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {edition.gallery.map((photo, index) => (
            <StaggerItem
              as="li"
              key={`${photo.image}-${index}`}
              className={index % 5 === 0 ? 'col-span-2' : undefined}
            >
              <figure className="group overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)]">
                <Image
                  src={photo.image}
                  alt={photo.caption ?? ''}
                  aspect={index % 5 === 0 ? 'aspect-16/10' : 'aspect-square'}
                  className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.05]"
                />
                {photo.caption && (
                  <figcaption className="bg-[var(--surface-raised)] px-3 py-2 text-xs text-muted">
                    {photo.caption}
                  </figcaption>
                )}
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

function EditionEvents({ edition }: { edition: IeeeDayEdition }) {
  if (edition.events.length === 0) return null;

  return (
    <Section compact divided>
      <div className="shell space-y-12">
        <SectionHeader
          eyebrow="Programme"
          title="The day's events"
          description="Everything that ran as part of this edition."
          action={{ label: 'All events', to: '/events' }}
        />

        <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {edition.events.map((event) => (
            <StaggerItem as="li" key={event.slug}>
              <EventCard event={event} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

function toParagraphs(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export default function IeeeDayPage() {
  const { year: yearParam } = useParams();
  const navigate = useNavigate();
  const { link } = useSiteSettings();
  const joinUrl = link('join_url');

  const {
    data: editions,
    error,
    loading,
    reload,
  } = useAsync((signal) => publicApi.ieeeDayEditions(signal), []);

  const requestedYear = yearParam ? Number.parseInt(yearParam, 10) : null;
  const [activeYear, setActiveYear] = useState<number | null>(requestedYear);

  // Default to the current edition when no year is in the URL.
  useEffect(() => {
    if (requestedYear) {
      setActiveYear(requestedYear);
      return;
    }
    if (!editions || editions.length === 0) return;
    const current = editions.find((edition) => edition.is_current) ?? editions[0];
    setActiveYear(current?.year ?? null);
  }, [requestedYear, editions]);

  const edition = useMemo(() => {
    if (!editions) return null;
    return editions.find((item) => item.year === activeYear) ?? editions[0] ?? null;
  }, [editions, activeYear]);

  // A year in the URL that does not exist should not show a different one
  // under the wrong address.
  useEffect(() => {
    if (!editions || !requestedYear) return;
    if (!editions.some((item) => item.year === requestedYear)) {
      navigate('/ieee-day', { replace: true });
    }
  }, [editions, requestedYear, navigate]);

  if (loading && !editions) return <PageLoader label="Loading IEEE Day" />;

  if (error && !editions) {
    return (
      <div className="shell py-32">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  if (!edition) {
    return (
      <>
        <Seo
          title="IEEE Day"
          description="IEEE Day at IIIT Delhi, celebrated every year on the first Tuesday of October."
          canonicalPath="/ieee-day"
        />
        <div className="shell py-32">
          <EmptyState
            icon={<SparkIcon className="size-5" />}
            title="No IEEE Day edition published yet"
            description="IEEE Day is celebrated worldwide on the first Tuesday of October. The branch's edition will appear here once it is added."
            action={
              <Link to="/events" className="btn btn-secondary btn-sm">
                See other events
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const paragraphs = toParagraphs(edition.description);

  return (
    <>
      <Seo
        title={`IEEE Day ${edition.year}`}
        description={
          edition.tagline ??
          edition.theme ??
          `IEEE Day ${edition.year} at the IEEE student branch, IIIT Delhi.`
        }
        image={edition.hero_image}
        canonicalPath={`/ieee-day/${edition.year}`}
      />

      <EditionHero edition={edition} />

      {editions && <EditionSwitcher editions={editions} activeYear={edition.year} />}

      {edition.hero_image && (
        <div className="shell pb-4">
          <Reveal>
            <Image
              src={edition.hero_image}
              alt=""
              aspect="aspect-21/9"
              loading="eager"
              className="rounded-[var(--radius-card)] border border-[var(--border-subtle)]"
            />
          </Reveal>
        </div>
      )}

      {paragraphs.length > 0 && (
        <Section compact>
          <div className="shell grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Reveal>
                <h2 className="fluid-heading font-semibold">What IEEE Day is</h2>
              </Reveal>
            </div>
            <div className="space-y-5 lg:col-span-8">
              {paragraphs.map((paragraph, index) => (
                <Reveal key={index} delay={index * 0.06}>
                  <p
                    className={
                      index === 0
                        ? 'text-lg leading-relaxed text-default'
                        : 'leading-relaxed text-muted'
                    }
                  >
                    {paragraph}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Stats edition={edition} />
      <EditionEvents edition={edition} />
      <Highlights edition={edition} />
      <Gallery edition={edition} />

      <Section compact divided>
        <div className="shell">
          <Reveal>
            <div className="card flex flex-col items-start gap-5 p-8 md:flex-row md:items-center md:justify-between md:p-12">
              <div className="space-y-2">
                <h2 className="fluid-subheading font-semibold">Want to help run the next one?</h2>
                <p className="max-w-xl text-muted">
                  IEEE Day is put together by the branch's own members, start to finish.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {joinUrl && (
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Join the branch
                    <ArrowUpRightIcon className="size-4" />
                  </a>
                )}
                <Link to="/contact" className="btn btn-secondary">
                  Partner with us
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
