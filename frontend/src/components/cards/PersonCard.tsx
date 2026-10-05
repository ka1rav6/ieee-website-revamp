/** Cards for team members and alumni. */

import { cx, displayHost } from '@/utils/format';
import { Portrait } from '@/components/ui/Media';
import {
  BriefcaseIcon,
  GitHubIcon,
  GlobeIcon,
  LinkedInIcon,
  MailIcon,
} from '@/components/ui/Icons';
import type { Alumnus, TeamMember } from '@/types/api';

interface SocialLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function buildSocialLinks(person: {
  name: string;
  email?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  website_url?: string | null;
}): SocialLink[] {
  const links: SocialLink[] = [];
  if (person.linkedin_url) {
    links.push({
      href: person.linkedin_url,
      label: `${person.name} on LinkedIn`,
      icon: <LinkedInIcon className="size-4" />,
    });
  }
  if (person.github_url) {
    links.push({
      href: person.github_url,
      label: `${person.name} on GitHub`,
      icon: <GitHubIcon className="size-4" />,
    });
  }
  if (person.website_url) {
    links.push({
      href: person.website_url,
      label: `${person.name}'s website`,
      icon: <GlobeIcon className="size-4" />,
    });
  }
  if (person.email) {
    links.push({
      href: `mailto:${person.email}`,
      label: `Email ${person.name}`,
      icon: <MailIcon className="size-4" />,
    });
  }
  return links;
}

function SocialRow({ links }: { links: SocialLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="flex items-center gap-1">
      {links.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target={link.href.startsWith('mailto:') ? undefined : '_blank'}
            rel="noopener noreferrer"
            // The icon alone is the control, so it carries an accessible name.
            aria-label={link.label}
            title={link.label}
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-200 hover:bg-[var(--surface-sunken)] hover:text-accent"
          >
            {link.icon}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function TeamCard({ member, className }: { member: TeamMember; className?: string }) {
  const links = buildSocialLinks(member);
  const detail = [member.department, member.year].filter(Boolean).join(' · ');

  return (
    <article
      className={cx('card card-interactive group flex h-full flex-col overflow-hidden', className)}
    >
      <Portrait src={member.photo} name={member.name} />

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base leading-tight font-semibold">{member.name}</h3>
        {member.position && (
          <p className="font-mono text-[0.6875rem] tracking-wide text-accent uppercase">
            {member.position}
          </p>
        )}
        {detail && <p className="text-xs text-faint">{detail}</p>}
        {member.bio && <p className="mt-1 line-clamp-3 text-sm text-muted">{member.bio}</p>}

        {links.length > 0 && (
          <div className="mt-auto pt-3">
            <SocialRow links={links} />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * A smaller team card for the executive committee, where most entries are a
 * name and a photo and a full card would waste the grid.
 */
export function TeamCardCompact({ member }: { member: TeamMember }) {
  return (
    <article className="card card-interactive group overflow-hidden">
      <Portrait src={member.photo} name={member.name} />
      <div className="p-3">
        <h3 className="truncate text-sm leading-tight font-semibold" title={member.name}>
          {member.name}
        </h3>
        {member.position && (
          <p className="truncate font-mono text-[0.625rem] tracking-wide text-faint uppercase">
            {member.position}
          </p>
        )}
      </div>
    </article>
  );
}

export function AlumniCard({ alumnus, className }: { alumnus: Alumnus; className?: string }) {
  const links = buildSocialLinks(alumnus);
  const study = [alumnus.degree, alumnus.branch].filter(Boolean).join(', ');

  return (
    <article
      className={cx('card card-interactive group flex h-full gap-4 overflow-hidden p-4', className)}
    >
      <Portrait
        src={alumnus.photo}
        name={alumnus.name}
        className="w-20 shrink-0 rounded-lg sm:w-24"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="space-y-0.5">
          <h3 className="leading-tight font-semibold">{alumnus.name}</h3>
          {alumnus.graduation_year && (
            <p className="font-mono text-[0.6875rem] tracking-wide text-faint">
              Class of {alumnus.graduation_year}
              {study ? ` · ${study}` : ''}
            </p>
          )}
        </div>

        {(alumnus.current_role || alumnus.current_organization) && (
          <p className="flex items-start gap-1.5 text-sm text-default">
            <BriefcaseIcon className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>
              {alumnus.current_role}
              {alumnus.current_role && alumnus.current_organization ? ' at ' : ''}
              {alumnus.current_organization && (
                <span className="font-medium text-strong">{alumnus.current_organization}</span>
              )}
            </span>
          </p>
        )}

        {alumnus.ieee_position && (
          <p className="text-xs text-muted">
            Former <span className="text-default">{alumnus.ieee_position}</span> at IEEE IIITD
          </p>
        )}

        {links.length > 0 && (
          <div className="mt-auto pt-1">
            <SocialRow links={links} />
          </div>
        )}
      </div>
    </article>
  );
}

/** A horizontal strip of notable alumni for the landing page. */
export function AlumniTile({ alumnus }: { alumnus: Alumnus }) {
  const host = displayHost(alumnus.linkedin_url);

  return (
    <article className="card card-interactive group w-56 shrink-0 overflow-hidden">
      <Portrait src={alumnus.photo} name={alumnus.name} />
      <div className="space-y-1 p-4">
        <h3 className="truncate text-sm font-semibold" title={alumnus.name}>
          {alumnus.name}
        </h3>
        {alumnus.current_organization && (
          <p className="truncate font-mono text-[0.625rem] tracking-wide text-accent uppercase">
            {alumnus.current_organization}
          </p>
        )}
        {alumnus.current_role && (
          <p className="truncate text-xs text-muted" title={alumnus.current_role}>
            {alumnus.current_role}
          </p>
        )}
        {alumnus.linkedin_url && (
          <a
            href={alumnus.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 pt-1 text-xs text-faint transition-colors hover:text-accent"
          >
            <LinkedInIcon className="size-3.5" />
            {host ?? 'LinkedIn'}
          </a>
        )}
      </div>
    </article>
  );
}
