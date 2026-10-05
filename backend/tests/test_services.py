"""Slugs, Markdown sanitising and upload validation."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.core.errors import ValidationError
from app.services.text import (
    build_excerpt,
    plain_text,
    reading_minutes,
    render_markdown,
    slugify,
    unique_slug,
)
from app.services.uploads import delete_image, save_image

# ---------------------------------------------------------------------------
# Slugs
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Hello World", "hello-world"),
        ("From Sand to Chip: The Journey", "from-sand-to-chip-the-journey"),
        ("Durkheim\u2019s Era", "durkheims-era"),  # curly apostrophe, as used on the old site
        ("  spaces   everywhere  ", "spaces-everywhere"),
        ("Already-A-Slug", "already-a-slug"),
        ("6G and the Need for Speed", "6g-and-the-need-for-speed"),
        ("Café Nescafé", "cafe-nescafe"),
        ("!!!", ""),
    ],
)
def test_slugify(value, expected):
    assert slugify(value) == expected


def test_slugify_respects_the_length_limit():
    assert len(slugify("word " * 100, max_length=40)) <= 40


def test_unique_slug_returns_the_base_when_free():
    assert unique_slug("A Title", lambda _: False) == "a-title"


def test_unique_slug_appends_a_counter_when_taken():
    taken = {"a-title"}

    assert unique_slug("A Title", lambda s: s in taken) == "a-title-2"


def test_unique_slug_keeps_counting_past_the_second():
    taken = {"a-title", "a-title-2", "a-title-3"}

    assert unique_slug("A Title", lambda s: s in taken) == "a-title-4"


def test_unique_slug_falls_back_for_unusable_input():
    assert unique_slug("!!!", lambda _: False) == "item"


# ---------------------------------------------------------------------------
# Markdown rendering and sanitising
# ---------------------------------------------------------------------------


def test_headings_and_paragraphs_render():
    html = render_markdown("## A Heading\n\nSome prose.")

    assert "<h2>A Heading</h2>" in html
    assert "<p>Some prose.</p>" in html


def test_lists_and_tables_render():
    html = render_markdown("- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |")

    assert "<ul>" in html
    assert "<table>" in html


def test_images_are_allowed():
    html = render_markdown("![Alt text](/legacy/blog/a.webp)")

    assert 'src="/legacy/blog/a.webp"' in html
    assert 'alt="Alt text"' in html


@pytest.mark.parametrize(
    "payload",
    [
        "<script>alert(1)</script>",
        "<SCRIPT>alert(1)</SCRIPT>",
        "<img src=x onerror=alert(1)>",
        "<iframe src='https://evil.example'></iframe>",
        "<style>body{display:none}</style>",
        "<object data='x'></object>",
        '<a href="javascript:alert(1)">click</a>',
        '<div onclick="alert(1)">text</div>',
        "<form action='/x'><input name='a'></form>",
    ],
)
def test_dangerous_markup_does_not_survive_rendering(payload):
    html = render_markdown(payload)

    assert "<script" not in html.lower()
    assert "onerror" not in html.lower()
    assert "onclick" not in html.lower()
    assert "javascript:" not in html.lower()
    assert "<iframe" not in html.lower()
    assert "<object" not in html.lower()
    assert "<form" not in html.lower()


def test_script_contents_are_removed_not_just_the_tags():
    html = render_markdown("Before <script>stealCookies()</script> after")

    assert "stealCookies" not in html


def test_external_links_get_noopener():
    html = render_markdown("[Devfolio](https://devfolio.co)")

    assert 'rel="noopener noreferrer"' in html
    assert 'target="_blank"' in html


def test_an_existing_rel_is_preserved():
    html = render_markdown('<a href="https://a.example" rel="nofollow">text</a>')

    assert 'rel="nofollow"' in html
    assert html.count("rel=") == 1


def test_relative_links_are_left_alone():
    html = render_markdown("[About](/about)")

    assert 'target="_blank"' not in html


def test_rendering_empty_input_is_safe():
    assert render_markdown("") == ""


# ---------------------------------------------------------------------------
# Excerpts and reading time
# ---------------------------------------------------------------------------


def test_plain_text_strips_markdown_syntax():
    text = plain_text("## Heading\n\nSome **bold** and a [link](https://x.example).")

    assert "**" not in text
    assert "](" not in text
    assert "Heading" in text
    assert "link" in text


def test_plain_text_drops_code_blocks_and_images():
    text = plain_text("```python\nsecret = 1\n```\n\n![alt](/a.png)\n\nProse.")

    assert "secret" not in text
    assert "/a.png" not in text
    assert "Prose." in text


def test_a_short_body_is_its_own_excerpt():
    assert build_excerpt("Short enough.") == "Short enough."


def test_a_long_excerpt_is_truncated_on_a_word_boundary():
    excerpt = build_excerpt("word " * 200, limit=50)

    assert excerpt.endswith("...")
    assert len(excerpt) <= 53
    assert "wor..." not in excerpt


def test_reading_time_is_at_least_one_minute():
    assert reading_minutes("") == 1
    assert reading_minutes("A couple of words.") == 1


def test_reading_time_grows_with_length():
    assert reading_minutes("word " * 2200) == 10


# ---------------------------------------------------------------------------
# Upload validation
# ---------------------------------------------------------------------------


def _png_bytes(size: tuple[int, int] = (64, 64)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 60, 140)).save(buffer, "PNG")
    return buffer.getvalue()


@pytest.fixture(autouse=True)
def upload_to_tmp(tmp_path, monkeypatch):
    """Keep test uploads out of the real upload directory."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "upload_dir", tmp_path / "uploads")
    yield


def test_a_valid_png_is_stored():
    stored = save_image(content=_png_bytes(), content_type="image/png", filename="logo.png")

    assert stored.url.startswith("/uploads/")
    assert stored.url.endswith(".png")
    assert stored.path.is_file()
    assert (stored.width, stored.height) == (64, 64)


def test_the_stored_name_does_not_come_from_the_client():
    stored = save_image(
        content=_png_bytes(), content_type="image/png", filename="../../etc/passwd.png"
    )

    assert "etc" not in stored.url
    assert ".." not in stored.url
    assert stored.path.is_file()


def test_two_uploads_of_the_same_name_do_not_collide():
    first = save_image(content=_png_bytes(), content_type="image/png", filename="logo.png")
    second = save_image(content=_png_bytes(), content_type="image/png", filename="logo.png")

    assert first.url != second.url


def test_a_renamed_script_is_refused():
    with pytest.raises(ValidationError, match="not a readable image"):
        save_image(
            content=b"#!/bin/sh\nrm -rf /\n", content_type="image/png", filename="payload.png"
        )


def test_an_svg_is_refused():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

    with pytest.raises(ValidationError):
        save_image(content=svg, content_type="image/svg+xml", filename="logo.svg")


def test_a_disallowed_content_type_is_refused():
    with pytest.raises(ValidationError, match="JPEG, PNG, WebP and GIF"):
        save_image(content=_png_bytes(), content_type="application/pdf", filename="a.pdf")


def test_an_empty_upload_is_refused():
    with pytest.raises(ValidationError, match="empty"):
        save_image(content=b"", content_type="image/png", filename="a.png")


def test_an_oversized_upload_is_refused(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_upload_size_mb", 0.0001)

    with pytest.raises(ValidationError, match="or smaller"):
        save_image(content=_png_bytes((500, 500)), content_type="image/png", filename="a.png")


def test_delete_removes_a_stored_image():
    stored = save_image(content=_png_bytes(), content_type="image/png", filename="a.png")

    assert delete_image(stored.url) is True
    assert not stored.path.exists()


@pytest.mark.parametrize(
    "url",
    [
        "/uploads/../../../etc/passwd",
        "/etc/passwd",
        "https://example.com/a.png",
        "/uploads/does-not-exist.png",
    ],
)
def test_delete_refuses_anything_outside_the_upload_directory(url):
    assert delete_image(url) is False
