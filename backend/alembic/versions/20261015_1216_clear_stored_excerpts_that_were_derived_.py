"""clear stored excerpts that were derived from the body

Until now an article without an excerpt had one generated from its body and
saved in `excerpt`, where it was indistinguishable from a written one: it went
stale when the body was edited and was exported into content/ as if authored.
Excerpts are now derived when a post is read, so the stored copies are
cleared. Only a value that exactly matches what the old code generated for
the current body is touched; anything else was typed by a person and stays.

Revision ID: 65ee4cca0fb2
Revises: 97f8416a1070
Create Date: 2026-10-15 12:16:29.704266
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '65ee4cca0fb2'
down_revision: str | None = '97f8416a1070'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# A frozen copy of the excerpt logic these values were generated with. It must
# not import app.services.text: that module keeps evolving, and this has to
# recognise exactly what the earlier version produced.
def _legacy_excerpt(markdown: str, limit: int = 220) -> str:
    text = re.sub(r"```.*?```", " ", markdown or "", flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#>*_`~|-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:")
    return f"{cut}..."


def upgrade() -> None:
    connection = op.get_bind()
    posts = connection.execute(
        sa.text("SELECT id, body, excerpt FROM blog_posts WHERE excerpt IS NOT NULL")
    ).all()
    derived = [post.id for post in posts if post.excerpt == _legacy_excerpt(post.body)]
    if derived:
        connection.execute(
            sa.text("UPDATE blog_posts SET excerpt = NULL WHERE id = ANY(:ids)"),
            {"ids": derived},
        )


def downgrade() -> None:
    # Nothing to restore: the cleared values are re-derived when read.
    pass
