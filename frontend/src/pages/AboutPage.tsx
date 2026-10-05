/**
 * /about - what the branch is, how it is organised, and what it runs.
 *
 * The prose comes from site settings; the numbers come from the live
 * database, so the page cannot drift out of date on its own.
 */

import { Link } from 'react-router-dom';
import { publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useCountUp } from '@/hooks/useInteraction';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Seo } from '@/components/Seo';
import { PageHeader, Section, SectionHeader } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { WhatWeDo } from '@/components/home/WhatWeDo';
import { ArrowRightIcon, ArrowUpRightIcon, ChipIcon, UsersIcon } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/States';
import type { SiteStats } from '@/types/api';

/** The three IEEE bodies the branch is affiliated with. */
const CHAPTERS = [
  {
    name: 'IEEE Student Branch',
    blurb:
      'The main branch. Runs the institute-scale events, the technical workshops and the speaker sessions, and holds the membership that gives students access to IEEE itself.',
    settingsKey: 'ieee_url',
  },
  {
    name: 'Women in Engineering',
    blurb:
      'The WIE sub-chapter, which runs its own programming - including STEM workshops taken out to school students - alongside the branch calendar.',
    settingsKey: 'wie_url',
  },
  {
    name: 'Computer Society',
    blurb:
      "CompSoc, the branch's computing sub-chapter, focused on software, systems and the competitive side of programming.",
    settingsKey: 'compsoc_url',
  },
] as const;

function StatRow({ stats }: { stats: SiteStats }) {
  const entries = [
    { value: stats.members, label: 'Active members' },
    { value: stats.events, label: 'Events run' },
    { value: stats.collaborations, label: 'Industry partners' },
    { value: stats.alumni, label: 'Alumni on record' },
    { value: stats.blog_posts, label: 'Articles published' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
      {entries.map((entry) => (
        <StatItem key={entry.label} value={entry.value} label={entry.label} />
      ))}
    </dl>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  const { ref, value: displayed } = useCountUp(value);
  return (
    <div ref={ref as React.Ref<HTMLDivElement>}>
      <dd className="font-display text-4xl font-bold text-strong tabular">{displayed}</dd>
      <dt className="mt-1 font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase">
        {label}
      </dt>
    </div>
  );
}

function toParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export default function AboutPage() {
  const { text, link } = useSiteSettings();
  const { data: stats } = useAsync((signal) => publicApi.stats(signal), []);

  const paragraphs = toParagraphs(text('about_body', ''));
  const joinUrl = link('join_url');

  return (
    <>
      <Seo
        title="About"
        description={text(
          'about_short',
          "IEEE-IIITD is the student branch of the world's largest technical professional organisation.",
        )}
        canonicalPath="/about"
      />

      <PageHeader
        eyebrow="About the branch"
        title="A student branch of the world's largest technical organisation"
        description={text(
          'about_short',
          "IEEE-IIITD is the student branch of the world's largest technical professional organisation dedicated to advancing technology to benefit humanity.",
        )}
      />

      <Section compact>
        <div className="shell grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="space-y-5 lg:col-span-7">
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className={
                    index === 0
                      ? 'text-lg leading-relaxed text-default'
                      : 'leading-relaxed text-muted'
                  }
                >
                  {paragraph}
                </p>
              ))
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            )}
          </div>

          <aside className="space-y-6 lg:col-span-5">
            <div className="card space-y-4 p-6">
              <h2 className="flex items-center gap-2.5 text-base font-semibold">
                <UsersIcon className="size-5 text-accent" />
                What membership gets you
              </h2>
              <ul className="space-y-3 text-sm text-muted">
                {[
                  'Eligibility for IEEE scholarships, grants and awards.',
                  'Access to IEEE publications, conferences and societies.',
                  'A network of student and professional members worldwide.',
                  'Ownership of the institute’s flagship technical events.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
              {joinUrl && (
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary w-full"
                >
                  Apply to join
                  <ArrowUpRightIcon className="size-4" />
                </a>
              )}
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="flex items-center gap-2.5 text-base font-semibold">
                <ChipIcon className="size-5 text-emphasis" />
                Where to find us
              </h2>
              <p className="text-sm text-muted">
                {text(
                  'contact_address',
                  'IIIT Delhi, Okhla Industrial Estate, Phase III, New Delhi 110020',
                )}
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
              >
                Get in touch
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </aside>
        </div>
      </Section>

      {stats && (
        <Section tone="sunken" compact divided>
          <div className="shell space-y-10">
            <SectionHeader
              eyebrow="By the numbers"
              title="The branch as it stands"
              description="Counted live from the site's own records, so these move as the branch does."
            />
            <Reveal>
              <StatRow stats={stats} />
            </Reveal>
          </div>
        </Section>
      )}

      <Section divided>
        <div className="shell space-y-12">
          <SectionHeader
            eyebrow="Structure"
            title="One branch, three chapters"
            description="The student branch and its two sub-chapters each run their own programming, and share one committee."
          />

          <Stagger as="ul" className="grid gap-5 md:grid-cols-3">
            {CHAPTERS.map((chapter) => {
              const href = link(chapter.settingsKey);
              return (
                <StaggerItem as="li" key={chapter.name}>
                  <article className="card flex h-full flex-col gap-3 p-6">
                    <h3 className="text-lg font-semibold">{chapter.name}</h3>
                    <p className="flex-1 text-sm text-muted">{chapter.blurb}</p>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                      >
                        Visit
                        <ArrowUpRightIcon className="size-3.5" />
                      </a>
                    )}
                  </article>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </Section>

      <WhatWeDo />
    </>
  );
}
