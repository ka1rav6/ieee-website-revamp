/**
 * The remaining landing-page bands: events, collaborations, team, alumni,
 * blogs, IEEE Day and the closing call to action.
 *
 * Each one takes the data it needs as a prop and renders nothing when that
 * data is empty, so a fresh database produces a shorter but still coherent
 * page rather than a run of empty headings.
 */

import { Link } from 'react-router-dom';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { Parallax } from '@/components/ui/Scroll';
import { Tilt } from '@/components/ui/Interactive';
import { BlogCard } from '@/components/cards/BlogCard';
import { EventCard } from '@/components/cards/EventCard';
import { AlumniTile, TeamCard } from '@/components/cards/PersonCard';
import { CollaborationMarquee } from '@/components/cards/CollaborationCard';
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon } from '@/components/ui/Icons';
import { formatDate } from '@/utils/format';
import type {
  Alumnus,
  BlogPostSummary,
  Collaboration,
  IeeeDayEdition,
  SiteEvent,
  TeamMember,
} from '@/types/api';

/* --- Events ------------------------------------------------------------- */

export function FeaturedEvents({ events }: { events: SiteEvent[] }) {
  if (events.length === 0) return null;

  return (
    <Section id="events" divided>
      <div className="shell space-y-12">
        <SectionHeader
          eyebrow="Events"
          title="What's on, and what just happened"
          description="The branch runs something most months. Here are the three most recent."
          action={{ label: 'Full archive', to: '/events' }}
        />

        <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <StaggerItem as="li" key={event.slug}>
              <EventCard event={event} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

/* --- Collaborations ----------------------------------------------------- */

export function CollaborationsBand({ collaborations }: { collaborations: Collaboration[] }) {
  if (collaborations.length === 0) return null;

  return (
    <Section tone="sunken" compact divided>
      <div className="space-y-8">
        <div className="shell">
          <SectionHeader
            eyebrow="Industry collaborations"
            title="Who we have worked with"
            description="Sponsors, workshop partners and prize partners across the branch's events."
            action={{ label: 'All collaborations', to: '/collaborations' }}
          />
        </div>

        <Reveal>
          <CollaborationMarquee collaborations={collaborations} />
        </Reveal>
      </div>
    </Section>
  );
}

/* --- Team --------------------------------------------------------------- */

export function CoreTeamBand({ members }: { members: TeamMember[] }) {
  if (members.length === 0) return null;

  return (
    <Section id="team" divided>
      <div className="shell space-y-12">
        <SectionHeader
          eyebrow="The team"
          title="Who runs the branch"
          description="The executive board for this term. The full roster, including the executive committee and faculty advisors, is on the team page."
          action={{ label: 'Meet everyone', to: '/team' }}
        />

        <Stagger
          as="ul"
          className="tilt-scene grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
        >
          {members.slice(0, 8).map((member) => (
            <StaggerItem as="li" key={member.slug}>
              <Tilt className="h-full" max={4}>
                <TeamCard member={member} />
              </Tilt>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

/* --- Alumni ------------------------------------------------------------- */

/**
 * Alumni shown as a horizontally scrolling strip.
 *
 * A strip signals "there are more of these" better than a truncated grid,
 * and keeps a long list from dominating the page.
 */
export function AlumniBand({ alumni }: { alumni: Alumnus[] }) {
  if (alumni.length === 0) return null;

  return (
    <Section tone="sunken" divided>
      <div className="space-y-10">
        <div className="shell">
          <SectionHeader
            eyebrow="Alumni"
            title="Where members end up"
            description="Former members of the branch, and what they went on to do."
            action={{ label: 'All alumni', to: '/alumni' }}
          />
        </div>

        <Reveal>
          <ul className="scroll-x flex snap-x snap-proximity gap-5 px-6 pb-4 [scrollbar-width:none] lg:px-[max(1.5rem,calc((100vw-78rem)/2+1.5rem))]">
            {alumni.map((alumnus) => (
              <li key={alumnus.slug} className="snap-start">
                <AlumniTile alumnus={alumnus} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

/* --- Blogs -------------------------------------------------------------- */

export function FeaturedBlogs({ posts }: { posts: BlogPostSummary[] }) {
  if (posts.length === 0) return null;

  return (
    <Section id="blog" divided>
      <div className="shell space-y-12">
        <SectionHeader
          eyebrow="Writing"
          title="From the blog"
          description="Members writing about the technology they find interesting - spacesuits, 6G, autonomous vehicles, oxytocin."
          action={{ label: 'Read the blog', to: '/blogs' }}
        />

        <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <StaggerItem as="li" key={post.slug}>
              <BlogCard post={post} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

/* --- IEEE Day ----------------------------------------------------------- */

export function IeeeDayBand({ edition }: { edition: IeeeDayEdition | null }) {
  if (!edition) return null;

  const celebrated = formatDate(edition.celebrated_on);

  return (
    <Section tone="sunken" compact divided>
      <div className="shell">
        <Reveal>
          <div className="card pads relative overflow-hidden">
            {/* The band gets its own glow so it reads as a distinct moment in
                the page without needing a different palette. Drifting it with
                scroll is what keeps the panel from reading as a flat inset. */}
            <Parallax className="absolute inset-0" distance={28}>
              <div className="glow -top-24 -right-16 size-80 bg-[var(--glow-secondary)]" />
              <div className="glow -bottom-20 left-0 size-72 bg-[var(--glow-signal)]" />
              <div className="grid-field absolute inset-0 opacity-60" />
            </Parallax>

            <div className="relative grid gap-8 p-7 md:grid-cols-12 md:items-center md:p-12">
              <div className="space-y-4 md:col-span-7">
                <p className="eyebrow">
                  IEEE Day {edition.year}
                  {celebrated ? ` · ${celebrated}` : ''}
                </p>

                <h2 className="fluid-heading font-semibold">
                  {edition.theme ?? 'IEEE Day at IIIT Delhi'}
                </h2>

                {edition.tagline && <p className="text-lg text-muted">{edition.tagline}</p>}

                <Link to="/ieee-day" className="btn btn-primary mt-2">
                  Explore IEEE Day
                  <ArrowRightIcon className="size-4" />
                </Link>
              </div>

              {edition.stats.length > 0 && (
                <dl className="grid grid-cols-2 gap-5 md:col-span-5">
                  {edition.stats.slice(0, 4).map((stat) => (
                    <div key={stat.label} className="space-y-1">
                      <dd className="font-display text-2xl font-bold text-strong tabular">
                        {stat.value}
                      </dd>
                      <dt className="font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase">
                        {stat.label}
                      </dt>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* --- Call to action ----------------------------------------------------- */

export function JoinCta({
  heading,
  perks,
  joinUrl,
}: {
  heading: string;
  perks: string[];
  joinUrl?: string;
}) {
  return (
    <Section id="join" divided>
      <div className="shell">
        <Reveal>
          <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-inverted)] px-7 py-12 md:px-14 md:py-16">
            {/* On the inverted surface the body text colour would vanish, so
                this block sets its own text colours explicitly. */}
            <Parallax className="absolute inset-0" distance={36}>
              <div className="glow -bottom-32 left-1/4 size-96 bg-[var(--glow-primary)] opacity-70" />
              <div className="glow -top-24 right-1/4 size-72 bg-[var(--glow-signal)] opacity-60" />
            </Parallax>

            <div className="relative grid gap-10 md:grid-cols-12 md:items-center">
              <div className="space-y-5 md:col-span-6">
                <p className="eyebrow !text-[color-mix(in_oklab,var(--surface-base)_65%,transparent)]">
                  Membership
                </p>
                <h2 className="fluid-heading font-semibold !text-[var(--surface-base)]">
                  {heading}
                </h2>
                <div className="flex flex-wrap gap-3 pt-2">
                  {joinUrl && (
                    <a
                      href={joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-lg bg-[var(--surface-base)] text-[var(--surface-inverted)] hover:bg-[color-mix(in_oklab,var(--surface-base)_88%,var(--accent))]"
                    >
                      Apply to join
                      <ArrowUpRightIcon className="size-4" />
                    </a>
                  )}
                  <Link
                    to="/contact"
                    className="btn btn-lg border-[color-mix(in_oklab,var(--surface-base)_30%,transparent)] text-[var(--surface-base)] hover:bg-[color-mix(in_oklab,var(--surface-base)_12%,transparent)]"
                  >
                    Collaborate with us
                  </Link>
                </div>
              </div>

              {perks.length > 0 && (
                <ul className="space-y-3.5 md:col-span-6">
                  {perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_30%,transparent)] text-[var(--surface-base)]"
                        aria-hidden="true"
                      >
                        <CheckIcon className="size-3" />
                      </span>
                      <span className="text-[color-mix(in_oklab,var(--surface-base)_82%,transparent)]">
                        {perk}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
