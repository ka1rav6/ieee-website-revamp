"""Slugs, excerpts and safe Markdown rendering."""

from __future__ import annotations

import re
import unicodedata

import bleach
from markdown_it import MarkdownIt

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
# Matched before sanitising so that script/style *contents* are dropped too.
# bleach's allow-list removes the tags but keeps their text, which would
# otherwise render a blocked script's source as article prose.
_EXECUTABLE_BLOCK = re.compile(r"<(script|style|iframe|object|embed)\b.*?</\1\s*>", re.S | re.I)
_WORD = re.compile(r"\w+")

# Words per minute used for the "N min read" label.
READING_SPEED_WPM = 220

_markdown = MarkdownIt("commonmark", {"typographer": True}).enable(
    ["table", "strikethrough", "replacements", "smartquotes"]
)

# Tags a post author legitimately needs. Anything else, `<script>` above all,
# is stripped: post bodies are rendered as HTML in the browser, so this is the
# boundary that prevents stored XSS.
ALLOWED_TAGS = {
    "p",
    "br",
    "hr",
    "em",
    "strong",
    "del",
    "code",
    "pre",
    "blockquote",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "sup",
    "sub",
    "span",
}
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel", "target"],
    "img": ["src", "alt", "title", "loading", "decoding"],
    "span": ["class"],
    "code": ["class"],
    "th": ["align"],
    "td": ["align"],
}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def slugify(value: str, *, max_length: int = 200) -> str:
    """Turn a title into a URL-safe slug.

    Non-ASCII characters are transliterated where possible so that a title
    like "Durkheim's era" produces a clean, typeable URL.
    """
    normalised = unicodedata.normalize("NFKD", value)
    ascii_only = normalised.encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_STRIP.sub("-", ascii_only.lower()).strip("-")
    return slug[:max_length].strip("-")


def unique_slug(base: str, exists: object, *, max_length: int = 200) -> str:
    """Append -2, -3, ... until `exists(slug)` is False.

    `exists` is a callable taking a candidate slug; the caller supplies the
    database lookup so this stays free of query logic.
    """
    assert callable(exists)
    slug = slugify(base, max_length=max_length) or "item"
    if not exists(slug):
        return slug
    for suffix in range(2, 1000):
        candidate = f"{slug[: max_length - len(str(suffix)) - 1]}-{suffix}"
        if not exists(candidate):
            return candidate
    raise ValueError(f"Could not derive a unique slug from {base!r}")


def render_markdown(body: str) -> str:
    """Render Markdown to HTML, then sanitise it.

    Sanitising after rendering is what makes admin-authored content safe to
    inject into the page: raw HTML in the source passes through the renderer
    but cannot survive the allow-list.
    """
    html = _EXECUTABLE_BLOCK.sub("", _markdown.render(body or ""))
    cleaned = bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
    return _harden_external_links(cleaned)


_EXTERNAL_LINK = re.compile(r'<a\s+(?![^>]*\brel=)([^>]*\bhref="https?://[^>]*)>', re.I)


def _harden_external_links(html: str) -> str:
    """Make external links open in a new tab without leaking window access.

    Only links that do not already carry a `rel` are touched, so explicit
    author intent is preserved.
    """
    return _EXTERNAL_LINK.sub(r'<a rel="noopener noreferrer" target="_blank" \1>', html)


def plain_text(markdown: str) -> str:
    """Strip Markdown down to prose, for excerpts and meta descriptions."""
    text = re.sub(r"```.*?```", " ", markdown or "", flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#>*_`~|-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_excerpt(markdown: str, *, limit: int = 220) -> str:
    """A single-paragraph summary that ends on a word boundary."""
    text = plain_text(markdown)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:")
    return f"{cut}..."


def reading_minutes(markdown: str) -> int:
    """Estimated reading time, never less than one minute."""
    words = len(_WORD.findall(plain_text(markdown)))
    return max(1, round(words / READING_SPEED_WPM))
