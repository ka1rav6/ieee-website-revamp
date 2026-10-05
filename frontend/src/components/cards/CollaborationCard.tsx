/** Collaboration cards and the logo marquee. */

import { useSpotlight } from '@/hooks/useInteraction';
import { cx, displayHost } from '@/utils/format';
import { LogoMark } from '@/components/ui/Media';
import { ArrowUpRightIcon } from '@/components/ui/Icons';
import type { Collaboration } from '@/types/api';

export function CollaborationCard({
  collaboration,
  className,
}: {
  collaboration: Collaboration;
  className?: string;
}) {
  const { ref, onPointerMove } = useSpotlight<HTMLElement>();
  const host = displayHost(collaboration.website_url);

  const content = (
    <>
      <div className="flex h-16 items-center">
        <LogoMark src={collaboration.logo} name={collaboration.name} />
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{collaboration.name}</h3>
          {collaboration.year && <span className="chip tabular">{collaboration.year}</span>}
        </div>

        {collaboration.collaboration_type && (
          <p className="font-mono text-[0.625rem] tracking-wider text-accent uppercase">
            {collaboration.collaboration_type}
          </p>
        )}

        {collaboration.description && (
          <p className="text-sm text-muted">{collaboration.description}</p>
        )}
      </div>

      {host && (
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] text-faint transition-colors group-hover:text-accent">
          {host}
          <ArrowUpRightIcon className="size-3.5" />
        </span>
      )}
    </>
  );

  const shared = cx(
    'card card-interactive spotlight group flex h-full flex-col gap-4 p-5',
    className,
  );

  // Only render an anchor when there is somewhere to go; a link to nowhere
  // is worse than a plain card.
  return collaboration.website_url ? (
    <a
      ref={ref as React.Ref<HTMLAnchorElement>}
      onPointerMove={onPointerMove}
      href={collaboration.website_url}
      target="_blank"
      rel="noopener noreferrer"
      className={shared}
    >
      {content}
    </a>
  ) : (
    <article ref={ref} onPointerMove={onPointerMove} className={shared}>
      {content}
    </article>
  );
}

/**
 * A continuously scrolling band of logos.
 *
 * The track holds two copies of the list and translates by exactly -50%, so
 * the loop is seamless. It is a CSS animation, which keeps it off the main
 * thread, pauses on hover, and stops entirely under reduced motion.
 */
export function CollaborationMarquee({ collaborations }: { collaborations: Collaboration[] }) {
  if (collaborations.length === 0) return null;

  const items = [...collaborations, ...collaborations];

  return (
    <div
      className="marquee relative overflow-hidden py-2"
      // Decorative duplication would be read twice by a screen reader; the
      // collaborations page lists them properly.
      aria-hidden="true"
    >
      {/* Fade the ends so logos enter and leave rather than being cut off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--surface-sunken)] to-transparent md:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--surface-sunken)] to-transparent md:w-28" />

      <ul className="marquee-track flex w-max items-center gap-10 md:gap-16">
        {items.map((collaboration, index) => (
          <li
            key={`${collaboration.slug}-${index}`}
            className="flex h-14 shrink-0 items-center opacity-55 grayscale transition-[opacity,filter] duration-300 hover:opacity-100 hover:grayscale-0"
          >
            <LogoMark src={collaboration.logo} name={collaboration.name} className="max-h-8" />
          </li>
        ))}
      </ul>
    </div>
  );
}
