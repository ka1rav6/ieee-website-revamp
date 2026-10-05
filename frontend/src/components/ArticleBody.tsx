/**
 * Typography for article bodies.
 *
 * The HTML is sanitised server-side against an allow-list before it ever
 * reaches the browser, which is what makes `dangerouslySetInnerHTML` safe
 * here - see `render_markdown` in the backend's text service. Styling is
 * applied with descendant selectors rather than per-element classes, because
 * the markup comes from the API and carries no classes of its own.
 */

import './article-body.css';

export function ArticleBody({ html }: { html: string }) {
  return (
    <div
      className="article-body"
      // Safe: sanitised by the backend. Never pass unsanitised HTML here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
