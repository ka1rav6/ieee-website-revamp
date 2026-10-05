/**
 * /collaborations - the organisations the branch has worked with, and an
 * invitation for more.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { cx } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { PageHeader, Section, SectionHeader } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { CollaborationCard } from '@/components/cards/CollaborationCard';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/States';
import {
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingIcon,
  MicIcon,
  TrophyIcon,
} from '@/components/ui/Icons';

/** The ways an organisation can work with the branch. */
const PARTNERSHIP_KINDS = [
  {
    icon: <TrophyIcon className="size-5" />,
    title: 'Event sponsorship',
    description:
      'Back a hackathon, a cryptic hunt or a flagship competition. Your brand in front of the whole institute, and prizes that get people to show up.',
  },
  {
    icon: <MicIcon className="size-5" />,
    title: 'Talks and speaker sessions',
    description:
      'Send an engineer to talk about what your team actually builds. These are consistently the best-attended sessions the branch runs.',
  },
  {
    icon: <BriefcaseIcon className="size-5" />,
    title: 'Technical workshops',
    description:
      'Run a hands-on session on your tooling or your problem space, with students who will have something working by the end.',
  },
  {
    icon: <BuildingIcon className="size-5" />,
    title: 'Research collaboration',
    description:
      "Work with faculty and students across the institute's labs, through the branch and its sub-chapters.",
  },
] as const;

export default function CollaborationsPage() {
  const [year, setYear] = useState<number | null>(null);
  const { data, error, loading, reload } = useAsync(
    (signal) => publicApi.collaborations({}, signal),
    [],
  );

  // Year filters are only offered for years that actually have entries.
  const years = useMemo(() => {
    const present = new Set<number>();
    for (const collaboration of data ?? []) {
      if (collaboration.year) present.add(collaboration.year);
    }
    return [...present].sort((a, b) => b - a);
  }, [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    return year === null ? data : data.filter((item) => item.year === year);
  }, [data, year]);

  return (
    <>
      <Seo
        title="Collaborations"
        description="Organisations that have sponsored, taught at or partnered with the IEEE student branch at IIIT Delhi, and how to work with us."
        canonicalPath="/collaborations"
      />

      <PageHeader
        eyebrow="Industry collaborations"
        title="Who we work with"
        description="From NASA JPL to Devfolio, Wolfram to Coding Blocks - organisations that have sponsored events, taught workshops or put up prizes."
      />

      <Section compact>
        <div className="shell space-y-10">
          {years.length > 1 && (
            <Reveal>
              <div className="scroll-x no-scrollbar -mx-6 px-6">
                <ul className="flex w-max items-center gap-2" aria-label="Filter by year">
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

          {loading && !data && <SkeletonGrid count={6} />}

          {error && !data && <ErrorState error={error} onRetry={reload} />}

          {data && visible.length === 0 && (
            <EmptyState
              icon={<BuildingIcon className="size-5" />}
              title={
                year ? `No collaborations recorded for ${year}` : 'No collaborations listed yet'
              }
              description={
                year
                  ? 'Try another year, or view them all.'
                  : 'Collaborations appear here once they are added in the dashboard.'
              }
              action={
                year ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setYear(null)}
                  >
                    Show all years
                  </button>
                ) : undefined
              }
            />
          )}

          {visible.length > 0 && (
            <Stagger as="ul" step={0.04} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((collaboration) => (
                <StaggerItem as="li" key={collaboration.slug}>
                  <CollaborationCard collaboration={collaboration} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </Section>

      <Section tone="sunken" divided>
        <div className="shell space-y-12">
          <SectionHeader
            eyebrow="Work with us"
            title="Four ways to get involved"
            description="The branch runs events across the academic year, and is always open to organisations who want to be part of them."
          />

          <Stagger as="ul" className="grid gap-5 sm:grid-cols-2">
            {PARTNERSHIP_KINDS.map((kind) => (
              <StaggerItem as="li" key={kind.title}>
                <article className="card flex h-full gap-4 p-6">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] text-accent"
                    aria-hidden="true"
                  >
                    {kind.icon}
                  </span>
                  <div className="space-y-1.5">
                    <h3 className="font-semibold">{kind.title}</h3>
                    <p className="text-sm text-muted">{kind.description}</p>
                  </div>
                </article>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal>
            <div className="card flex flex-col items-start gap-5 p-8 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1.5">
                <h3 className="fluid-subheading font-semibold">Something else in mind?</h3>
                <p className="text-muted">
                  Tell us what you have in mind and the branch will come back to you.
                </p>
              </div>
              <Link to="/contact" className="btn btn-primary shrink-0">
                Start a conversation
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
