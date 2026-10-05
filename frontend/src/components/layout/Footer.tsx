/**
 * Site footer: identity, navigation, affiliations, socials and contact.
 *
 * Everything here reads from site settings, so the branch can change an
 * address, a social handle or the join link from the dashboard.
 */

import { Link } from 'react-router-dom';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  MailIcon,
  MapPinIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/ui/Icons';
import { Brand } from './Brand';

const SITE_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/team', label: 'Team' },
  { to: '/events', label: 'Events' },
  { to: '/blogs', label: 'Blog' },
  { to: '/ieee-day', label: 'IEEE Day' },
  { to: '/alumni', label: 'Alumni' },
  { to: '/collaborations', label: 'Collaborations' },
  { to: '/contact', label: 'Contact' },
] as const;

export function Footer() {
  const { text, link } = useSiteSettings();
  const email = text('contact_email', 'ieee@iiitd.ac.in');
  const address = text(
    'contact_address',
    'IIIT Delhi, Okhla Industrial Estate, Phase III, New Delhi 110020',
  );

  const socials = [
    { key: 'instagram_url', label: 'Instagram', Icon: InstagramIcon },
    { key: 'linkedin_url', label: 'LinkedIn', Icon: LinkedInIcon },
    { key: 'twitter_url', label: 'X', Icon: XIcon },
    { key: 'youtube_url', label: 'YouTube', Icon: YouTubeIcon },
    { key: 'facebook_url', label: 'Facebook', Icon: FacebookIcon },
  ]
    .map((social) => ({ ...social, href: link(social.key) }))
    .filter((social): social is typeof social & { href: string } => Boolean(social.href));

  const affiliations = [
    { key: 'institute_url', label: 'IIIT Delhi' },
    { key: 'ieee_url', label: 'IEEE' },
    { key: 'wie_url', label: 'Women in Engineering' },
    { key: 'compsoc_url', label: 'IEEE Computer Society' },
  ]
    .map((item) => ({ ...item, href: link(item.key) }))
    .filter((item): item is typeof item & { href: string } => Boolean(item.href));

  const brandingUrl = link('branding_url');

  return (
    <footer className="relative mt-auto overflow-hidden border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
      <div
        className="glow -bottom-40 left-1/3 size-96 bg-[var(--glow-primary)] opacity-50"
        aria-hidden="true"
      />

      <div className="shell relative py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="space-y-5 md:col-span-5">
            <Brand />
            <p className="max-w-sm text-sm text-muted">
              {text(
                'about_short',
                "The student branch of the world's largest technical professional organisation, at IIIT Delhi.",
              )}
            </p>

            {socials.length > 0 && (
              <ul className="flex items-center gap-1.5">
                {socials.map(({ key, label, href, Icon }) => (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`IEEE IIIT Delhi on ${label}`}
                      title={label}
                      className="grid size-9 place-items-center rounded-lg border border-[var(--border-subtle)] text-muted transition-colors duration-200 hover:border-accent hover:text-accent"
                    >
                      <Icon className="size-[1.0625rem]" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-labelledby="footer-site" className="md:col-span-3">
            <h2
              id="footer-site"
              className="font-mono text-[0.6875rem] tracking-[0.14em] text-faint uppercase"
            >
              Explore
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-y-2.5 md:grid-cols-1">
              {SITE_LINKS.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="text-sm text-muted transition-colors duration-200 hover:text-strong"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {affiliations.length > 0 && (
            <nav aria-labelledby="footer-affiliations" className="md:col-span-2">
              <h2
                id="footer-affiliations"
                className="font-mono text-[0.6875rem] tracking-[0.14em] text-faint uppercase"
              >
                Affiliations
              </h2>
              <ul className="mt-4 space-y-2.5">
                {affiliations.map((item) => (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted transition-colors duration-200 hover:text-strong"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="md:col-span-2">
            <h2 className="font-mono text-[0.6875rem] tracking-[0.14em] text-faint uppercase">
              Reach us
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-start gap-2 transition-colors duration-200 hover:text-strong"
                >
                  <MailIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="break-all">{email}</span>
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{address}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-faint">
            © {new Date().getFullYear()} IEEE Student Branch, IIIT Delhi
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {brandingUrl && (
              <a
                href={brandingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-faint transition-colors duration-200 hover:text-accent"
              >
                Graphic identity
              </a>
            )}
            <Link
              to="/admin"
              className="font-mono text-xs text-faint transition-colors duration-200 hover:text-accent"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
