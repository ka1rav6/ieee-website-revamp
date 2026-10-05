/**
 * Per-page document head: title, description, canonical URL, Open Graph and
 * Twitter cards, plus optional JSON-LD.
 *
 * Written imperatively rather than with a head library because the set of
 * tags is small and fixed, and because every tag this component adds is also
 * removed on unmount - so navigating between pages cannot leave a previous
 * page's description behind.
 */

import { useEffect } from 'react';

interface SeoProps {
  title: string;
  description?: string;
  /** Absolute or site-relative path of a preview image. */
  image?: string | null;
  /** 'article' for blog posts, 'website' otherwise. */
  type?: 'website' | 'article';
  /** Overrides the canonical URL, which defaults to the current location. */
  canonicalPath?: string;
  publishedTime?: string | null;
  author?: string | null;
  /** Keeps a page out of search results, e.g. the admin area. */
  noIndex?: boolean;
  /** Structured data, serialised into a JSON-LD script tag. */
  jsonLd?: Record<string, unknown>;
}

const SITE_NAME = 'IEEE IIIT Delhi';
const MANAGED = 'data-seo-managed';

function absoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

/** Create or update a tag, marking it so it can be cleaned up on unmount. */
function setMeta(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) {
  let element = document.head.querySelector<HTMLElement>(selector);
  if (!element) {
    element = create();
    element.setAttribute(MANAGED, 'true');
    document.head.appendChild(element);
  }
  apply(element);
  return element;
}

function setNamedMeta(name: string, content: string | undefined) {
  if (!content) return;
  setMeta(
    `meta[name="${name}"]`,
    () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', name);
      return meta;
    },
    (meta) => meta.setAttribute('content', content),
  );
}

function setPropertyMeta(property: string, content: string | undefined) {
  if (!content) return;
  setMeta(
    `meta[property="${property}"]`,
    () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', property);
      return meta;
    },
    (meta) => meta.setAttribute('content', content),
  );
}

export function Seo({
  title,
  description,
  image,
  type = 'website',
  canonicalPath,
  publishedTime,
  author,
  noIndex = false,
  jsonLd,
}: SeoProps) {
  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    const canonical = absoluteUrl(canonicalPath ?? window.location.pathname);
    const previewImage = absoluteUrl(image);

    setNamedMeta('description', description);
    setNamedMeta('robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    setPropertyMeta('og:title', fullTitle);
    setPropertyMeta('og:description', description);
    setPropertyMeta('og:type', type);
    setPropertyMeta('og:site_name', SITE_NAME);
    setPropertyMeta('og:url', canonical);
    setPropertyMeta('og:image', previewImage);

    setNamedMeta('twitter:card', previewImage ? 'summary_large_image' : 'summary');
    setNamedMeta('twitter:title', fullTitle);
    setNamedMeta('twitter:description', description);
    setNamedMeta('twitter:image', previewImage);

    if (type === 'article') {
      setPropertyMeta('article:published_time', publishedTime ?? undefined);
      setPropertyMeta('article:author', author ?? undefined);
    }

    if (canonical) {
      setMeta(
        'link[rel="canonical"]',
        () => {
          const link = document.createElement('link');
          link.setAttribute('rel', 'canonical');
          return link;
        },
        (link) => link.setAttribute('href', canonical),
      );
    }

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute(MANAGED, 'true');
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      script?.remove();
    };
  }, [title, description, image, type, canonicalPath, publishedTime, author, noIndex, jsonLd]);

  return null;
}
