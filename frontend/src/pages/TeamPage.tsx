/**
 * /team - the full roster, grouped the way the branch is organised.
 *
 * Faculty, the executive board and mentors get full cards; the executive
 * committee is thirty-nine people, so it uses a denser card to stay a grid
 * rather than becoming a scroll.
 */

import { useMemo } from 'react';
import { publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { TEAM_CATEGORY_BLURBS, TEAM_CATEGORY_LABELS, TEAM_CATEGORY_ORDER } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { PageHeader, Section } from '@/components/ui/Section';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/Reveal';
import { TeamCard, TeamCardCompact } from '@/components/cards/PersonCard';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/States';
import { UsersIcon } from '@/components/ui/Icons';
import type { TeamMember } from '@/types/api';

/** Categories rendered with the dense card. */
const COMPACT_CATEGORIES = new Set(['executive']);

function TeamGroup({ category, members }: { category: string; members: TeamMember[] }) {
  const compact = COMPACT_CATEGORIES.has(category);
  const headingId = `team-${category}`;

  return (
    <section aria-labelledby={headingId} className="space-y-8">
      <Reveal className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id={headingId} className="fluid-subheading font-semibold">
            {TEAM_CATEGORY_LABELS[category] ?? category}
          </h2>
          <span className="chip tabular">
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        {TEAM_CATEGORY_BLURBS[category] && (
          <p className="max-w-2xl text-muted">{TEAM_CATEGORY_BLURBS[category]}</p>
        )}
      </Reveal>

      <Stagger
        as="ul"
        step={compact ? 0.025 : 0.06}
        className={
          compact
            ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
            : 'grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4'
        }
      >
        {members.map((member) => (
          <StaggerItem as="li" key={member.slug}>
            {compact ? <TeamCardCompact member={member} /> : <TeamCard member={member} />}
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

export default function TeamPage() {
  const { data, error, loading, reload } = useAsync((signal) => publicApi.team({}, signal), []);

  // Group once per data change rather than on every render.
  const groups = useMemo(() => {
    if (!data) return [];
    return TEAM_CATEGORY_ORDER.map((category) => ({
      category,
      members: data.filter((member) => member.category === category),
    })).filter((group) => group.members.length > 0);
  }, [data]);

  const term = data?.find((member) => member.term)?.term;

  return (
    <>
      <Seo
        title="Team"
        description="The faculty advisors, executive board and executive committee of the IEEE student branch at IIIT Delhi."
        canonicalPath="/team"
      />

      <PageHeader
        eyebrow={term ? `Roster ${term}` : 'Roster'}
        title="The people behind the branch"
        description="One of the largest and most diverse teams of any club at the institute - faculty advisors, an executive board, and the committee that makes every event happen."
      />

      <Section compact>
        <div className="shell space-y-20">
          {loading && !data && <SkeletonGrid count={8} className="lg:grid-cols-4" />}

          {error && !data && <ErrorState error={error} onRetry={reload} />}

          {data && groups.length === 0 && (
            <EmptyState
              icon={<UsersIcon className="size-5" />}
              title="The roster is not published yet"
              description="Team members appear here once they are added in the dashboard."
            />
          )}

          {groups.map((group) => (
            <TeamGroup key={group.category} category={group.category} members={group.members} />
          ))}
        </div>
      </Section>
    </>
  );
}
