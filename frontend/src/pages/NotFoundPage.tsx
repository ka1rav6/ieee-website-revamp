/**
 * The 404 page.
 *
 * Offers the places a visitor most likely wanted, rather than just saying
 * the page is gone.
 */

import { Link } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { ArrowRightIcon } from '@/components/ui/Icons';

const SUGGESTIONS = [
  { to: '/events', label: 'Events', blurb: 'Everything the branch has run.' },
  { to: '/blogs', label: 'Blog', blurb: 'Articles written by members.' },
  { to: '/team', label: 'Team', blurb: 'Who runs the branch this term.' },
  { to: '/contact', label: 'Contact', blurb: 'Ask us something directly.' },
] as const;

export default function NotFoundPage() {
  return (
    <>
      {/* A missing page must not end up in a search index. */}
      <Seo title="Page not found" noIndex />

      <div className="relative flex flex-1 items-center overflow-hidden py-28">
        <div className="grid-field absolute inset-0" aria-hidden="true" />
        <div className="glow top-0 left-1/3 size-80 bg-[var(--glow-primary)]" aria-hidden="true" />

        <div className="shell relative">
          <div className="max-w-2xl space-y-6">
            <p className="eyebrow">Error 404</p>
            <h1 className="fluid-display font-bold">
              <span className="text-gradient">Nothing here.</span>
            </h1>
            <p className="text-lg text-muted">
              That address does not match any page on this site. It may have moved, or the link that
              brought you here may be out of date.
            </p>

            <nav aria-label="Suggested pages" className="pt-4">
              <ul className="grid gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="card card-interactive group flex items-center justify-between gap-3 p-4"
                    >
                      <span>
                        <span className="block font-semibold text-strong">{item.label}</span>
                        <span className="block text-sm text-muted">{item.blurb}</span>
                      </span>
                      <ArrowRightIcon className="size-4 shrink-0 text-faint transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <Link to="/" className="btn btn-primary mt-2">
              Back to the homepage
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
