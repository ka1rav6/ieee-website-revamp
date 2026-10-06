/**
 * Blog card rendering, including the details that are genuinely optional on
 * imported content: dates, excerpts, cover images and categories.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlogCard } from './BlogCard';
import { makePost, renderWithProviders } from '@/test/utils';

describe('BlogCard', () => {
  it('shows the title, author and category', () => {
    renderWithProviders(<BlogCard post={makePost()} />);

    expect(screen.getByText('An Introduction to Web3')).toBeInTheDocument();
    expect(screen.getByText('Sameer Gupta')).toBeInTheDocument();
    expect(screen.getByText('Tech Affairs')).toBeInTheDocument();
  });

  it('links to the article by slug', () => {
    renderWithProviders(<BlogCard post={makePost({ slug: 'web-3' })} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/blogs/web-3');
  });

  it('shows the publication date and reading time', () => {
    renderWithProviders(<BlogCard post={makePost()} />);

    expect(screen.getByText(/2022/)).toBeInTheDocument();
    expect(screen.getByText(/4 min read/)).toBeInTheDocument();
  });

  it('omits the date for a post that has none', () => {
    // Ten of the eleven imported posts have no date, so this is the common
    // case rather than an edge case.
    renderWithProviders(<BlogCard post={makePost({ published_at: null })} />);

    expect(screen.queryByText(/2022/)).not.toBeInTheDocument();
    expect(screen.getByText('An Introduction to Web3')).toBeInTheDocument();
  });

  it('renders without an excerpt', () => {
    renderWithProviders(<BlogCard post={makePost({ excerpt: null })} />);

    expect(screen.getByText('An Introduction to Web3')).toBeInTheDocument();
  });

  it('renders without a category', () => {
    renderWithProviders(<BlogCard post={makePost({ category: null })} />);

    expect(screen.queryByText('Tech Affairs')).not.toBeInTheDocument();
  });

  it('gives a decorative cover image an empty alt when none is supplied', () => {
    const { container } = renderWithProviders(
      <BlogCard post={makePost({ cover_image: '/legacy/blog/a.webp', cover_image_alt: null })} />,
    );

    // An empty alt is correct here, and it is why the image has no `img`
    // role to query by: the title beside it already names the article, so
    // announcing the image too would be noise.
    const cover = container.querySelector('img');
    expect(cover).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses the supplied image description when there is one', () => {
    renderWithProviders(
      <BlogCard
        post={makePost({ cover_image: '/legacy/blog/a.webp', cover_image_alt: 'A Web3 diagram' })}
      />,
    );

    expect(screen.getByAltText('A Web3 diagram')).toBeInTheDocument();
  });
});
