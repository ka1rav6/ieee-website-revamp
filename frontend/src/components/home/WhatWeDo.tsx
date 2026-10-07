/**
 * "What we do" - the branch's activities.
 *
 * Fixed rather than database-driven: these are the categories of work the
 * branch does, not a content list that changes between terms. The events,
 * blogs and team sections next to it carry the live data.
 */

import type { ReactNode } from 'react';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { WordsReveal } from '@/components/ui/Scroll';
import { Tilt } from '@/components/ui/Interactive';
import {
  BookIcon,
  ChipIcon,
  FlaskIcon,
  MicIcon,
  SparkIcon,
  TrophyIcon,
  UsersIcon,
} from '@/components/ui/Icons';

interface Activity {
  icon: ReactNode;
  title: string;
  description: string;
  /** Spans two columns on wide screens, to break the grid's regularity. */
  wide?: boolean;
}

const ACTIVITIES: Activity[] = [
  {
    icon: <TrophyIcon className="size-5" />,
    title: 'Competitions',
    description:
      'Cryptic hunts, lockout coding duels, quizzes and hardware challenges. Slash, Xgrid and Bachmanity Insanity have run for years and still fill a room.',
    wide: true,
  },
  {
    icon: <ChipIcon className="size-5" />,
    title: 'Hardware & robotics',
    description:
      'Build a mini oscilloscope, fight a battle bot, wire up an Arduino. The sessions that get you away from a screen.',
  },
  {
    icon: <BookIcon className="size-5" />,
    title: 'Workshops',
    description:
      'Web development, CTFs, machine learning, home electronics labs. Hands on keyboards, something working by the end.',
  },
  {
    icon: <MicIcon className="size-5" />,
    title: 'Talks & seminars',
    description:
      "Engineers and researchers on what they actually work on - India's semiconductor ecosystem, packaging, the problems that are still open.",
  },
  {
    icon: <UsersIcon className="size-5" />,
    title: 'Student initiatives',
    description:
      'The Women in Engineering and Computer Society sub-chapters run their own programmes, including STEM outreach to school students.',
  },
  {
    icon: <FlaskIcon className="size-5" />,
    title: 'Research culture',
    description:
      "Access to IEEE's publications and a membership that puts you in the same room as the people writing them.",
    wide: true,
  },
];

function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <StaggerItem as="li" className={activity.wide ? 'sm:col-span-2 lg:col-span-2' : undefined}>
      <Tilt className="h-full">
        <article className="card card-interactive pads group flex h-full flex-col gap-3 p-6">
          <span
            className="grid size-10 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-accent transition-colors duration-300 group-hover:border-accent"
            aria-hidden="true"
          >
            {activity.icon}
          </span>
          <h3 className="text-lg font-semibold">{activity.title}</h3>
          <p className="text-sm text-muted">{activity.description}</p>
        </article>
      </Tilt>
    </StaggerItem>
  );
}

export function WhatWeDo() {
  return (
    <Section id="what-we-do" tone="sunken" divided>
      <div className="shell space-y-12">
        <SectionHeader
          eyebrow="What we do"
          title="Six ways the branch keeps busy"
          description="Everything here is built and run by students. The scale varies from a two-hour workshop to a 24-hour hunt across the internet."
        />

        <Stagger as="ul" className="tilt-scene grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIVITIES.map((activity) => (
            <ActivityCard key={activity.title} activity={activity} />
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

/**
 * The branch's self-description, split into a statement and the longer copy.
 *
 * The text comes from site settings so the branch can rewrite how it
 * describes itself without a code change.
 */
export function AboutPreview({ summary, paragraphs }: { summary: string; paragraphs: string[] }) {
  return (
    <Section id="about">
      <div className="shell grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal className="space-y-3">
            <p className="eyebrow">About</p>
            <WordsReveal
              as="h2"
              text={summary}
              className="fluid-heading text-balance font-semibold text-strong"
            />
          </Reveal>
          <div className="mt-7 flex items-center gap-3">
            <SparkIcon className="size-5 shrink-0 text-emphasis" />
            <p className="font-mono text-xs tracking-wide text-muted">
              IEEE · Women in Engineering · Computer Society
            </p>
          </div>
        </div>

        <Stagger className="space-y-5 lg:col-span-7" step={0.08}>
          {paragraphs.map((paragraph, index) => (
            <StaggerItem key={index}>
              <p
                className={
                  index === 0
                    ? 'text-lg leading-relaxed text-default'
                    : 'text-base leading-relaxed text-muted'
                }
              >
                {paragraph}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
