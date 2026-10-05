/**
 * The landing page.
 *
 * Everything it renders arrives in one `/landing` request, so the page does
 * not stage in piece by piece as six separate calls resolve.
 */

import { publicApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Seo } from '@/components/Seo';
import { Hero } from '@/components/home/Hero';
import { AboutPreview, WhatWeDo } from '@/components/home/WhatWeDo';
import {
  AlumniBand,
  CollaborationsBand,
  CoreTeamBand,
  FeaturedBlogs,
  FeaturedEvents,
  IeeeDayBand,
  JoinCta,
} from '@/components/home/Sections';
import { ErrorState, PageLoader } from '@/components/ui/States';

/** Split a settings block into paragraphs on blank lines. */
function toParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** Split a newline-separated settings list into items. */
function toList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function HomePage() {
  const { data, error, loading, reload } = useAsync((signal) => publicApi.landing(signal), []);
  const { text, link } = useSiteSettings();

  const description = text(
    'meta_description',
    'The IEEE student branch at IIIT Delhi. Technical events, workshops, talks and competitions run by students.',
  );

  // The organisation's structured data, so search results can show the
  // branch as an entity rather than just a page.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'IEEE Student Branch, IIIT Delhi',
    alternateName: 'IEEE IIIT Delhi',
    description,
    email: text('contact_email', 'ieee@iiitd.ac.in'),
    parentOrganization: { '@type': 'Organization', name: 'IEEE' },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Okhla Industrial Estate, Phase III',
      addressLocality: 'New Delhi',
      postalCode: '110020',
      addressCountry: 'IN',
    },
  };

  return (
    <>
      <Seo title="IEEE IIIT Delhi" description={description} canonicalPath="/" jsonLd={jsonLd} />

      {/* The hero renders immediately with no stats, so the first paint is
          the headline rather than a spinner. */}
      <Hero stats={data?.stats ?? null} />

      {loading && !data && <PageLoader label="Loading the page" />}

      {error && !data && (
        <div className="shell py-16">
          <ErrorState error={error} onRetry={reload} />
        </div>
      )}

      {data && (
        <>
          <AboutPreview
            summary={text(
              'about_short',
              "IEEE-IIITD is the student branch of the world's largest technical professional organisation.",
            )}
            paragraphs={toParagraphs(text('about_body', ''))}
          />

          <WhatWeDo />

          <FeaturedEvents events={data.featured_events} />

          <IeeeDayBand edition={data.ieee_day} />

          <CollaborationsBand collaborations={data.featured_collaborations} />

          <CoreTeamBand members={data.core_team} />

          <FeaturedBlogs posts={data.featured_posts} />

          <AlumniBand alumni={data.featured_alumni} />

          <JoinCta
            heading={text('join_heading', 'Become part of the community.')}
            perks={toList(text('join_perks', ''))}
            joinUrl={link('join_url')}
          />
        </>
      )}
    </>
  );
}
