"""The content/ import and export pipeline."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content.store import ContentError
from app.content.sync import ContentSync
from app.models.content import (
    Alumnus,
    BlogCategory,
    BlogPost,
    Collaboration,
    Event,
    IeeeDayEdition,
    SiteSetting,
    TeamCategory,
    TeamMember,
)


@pytest.fixture
def content_dir(tmp_path: Path) -> Path:
    """A minimal but complete content tree."""
    root = tmp_path / "content"
    blogs = root / "blogs"
    blogs.mkdir(parents=True)

    (root / "site.yaml").write_text("site_name: IEEE IIIT Delhi\ncontact_email: ieee@iiitd.ac.in\n")
    (root / "team.yaml").write_text(
        "- name: Anshul Kumar Singh\n"
        "  position: Chairperson\n"
        "  category: core\n"
        "- name: Dr. Example Faculty\n"
        "  position: Faculty Coordinator\n"
        "  category: faculty\n"
    )
    (root / "alumni.yaml").write_text(
        "- name: A Graduate\n  graduation_year: 2023\n  current_organization: Acme\n"
    )
    (root / "collaborations.yaml").write_text(
        "- name: Devfolio\n  website_url: https://devfolio.co\n  year: 2024\n"
    )
    (root / "events.yaml").write_text(
        "- title: Slash\n  date: 2026-03-13\n  description: A cryptic hunt.\n"
        "- title: Slash\n  date: 2023-04-19\n  description: An earlier edition.\n"
    )
    (root / "ieee-day.yaml").write_text(
        "- year: 2026\n"
        "  theme: A Theme\n"
        "  is_current: true\n"
        "  stats:\n"
        "    - label: Participants\n      value: '450'\n"
        "  highlights:\n"
        "    - title: Keynote\n      description: A talk.\n"
    )
    (blogs / "categories.yaml").write_text("- name: Tech Affairs\n- name: Tech Wonders\n")
    (blogs / "an-article.md").write_text(
        "---\n"
        "title: An Article\n"
        "author: An Author\n"
        "author_subtitle: B.Tech.\n"
        "category: tech-affairs\n"
        "tags:\n"
        "  - web3\n"
        "date: 2026-02-01\n"
        "published: true\n"
        "---\n\n"
        "## Heading\n\nSome prose about engineering.\n"
    )
    (blogs / "a-draft.md").write_text(
        "---\ntitle: A Draft\nauthor: An Author\npublished: false\n---\n\nNot ready yet.\n"
    )
    return root


def test_import_loads_every_kind_of_content(db: Session, content_dir: Path):
    report = ContentSync(db, content_dir).import_all()

    assert db.scalar(select(SiteSetting).where(SiteSetting.key == "site_name")).value == (
        "IEEE IIIT Delhi"
    )
    assert len(db.scalars(select(TeamMember)).all()) == 2
    assert len(db.scalars(select(Alumnus)).all()) == 1
    assert len(db.scalars(select(Collaboration)).all()) == 1
    assert len(db.scalars(select(Event)).all()) == 2
    assert len(db.scalars(select(BlogCategory)).all()) == 2
    assert len(db.scalars(select(BlogPost)).all()) == 2
    assert len(db.scalars(select(IeeeDayEdition)).all()) == 1
    assert report.total_changes > 0


def test_import_is_idempotent(db: Session, content_dir: Path):
    sync = ContentSync(db, content_dir)
    sync.import_all()

    second = sync.import_all()

    assert second.created == {}
    assert second.updated == {}
    assert second.deleted == {}
    assert sum(second.unchanged.values()) > 0


def test_importing_an_edited_file_updates_the_row(db: Session, content_dir: Path):
    sync = ContentSync(db, content_dir)
    sync.import_all()

    (content_dir / "team.yaml").write_text(
        "- name: Anshul Kumar Singh\n  position: Vice-Chairperson\n  category: core\n"
    )
    report = sync.import_all()

    member = db.scalar(select(TeamMember).where(TeamMember.slug == "anshul-kumar-singh"))
    assert member.position == "Vice-Chairperson"
    assert report.updated.get("team member") == 1


def test_file_order_becomes_display_order(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    members = db.scalars(select(TeamMember).order_by(TeamMember.sort_order)).all()

    assert [m.name for m in members] == ["Anshul Kumar Singh", "Dr. Example Faculty"]


def test_a_posts_filename_becomes_its_slug(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    assert db.scalar(select(BlogPost).where(BlogPost.slug == "an-article")) is not None


def test_frontmatter_drives_publication_state(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    article = db.scalar(select(BlogPost).where(BlogPost.slug == "an-article"))
    draft = db.scalar(select(BlogPost).where(BlogPost.slug == "a-draft"))

    assert article.is_published is True
    assert draft.is_published is False


def test_a_post_is_linked_to_its_category_and_tags(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    article = db.scalar(select(BlogPost).where(BlogPost.slug == "an-article"))

    assert article.category.slug == "tech-affairs"
    assert [tag.slug for tag in article.tags] == ["web3"]
    assert article.published_at == date(2026, 2, 1)


def test_excerpt_and_reading_time_are_derived(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    article = db.scalar(select(BlogPost).where(BlogPost.slug == "an-article"))

    assert article.excerpt
    assert article.reading_minutes >= 1


def test_events_sharing_a_title_get_distinct_slugs(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    slugs = sorted(e.slug for e in db.scalars(select(Event)).all())

    assert slugs == ["slash", "slash-2023"]


def test_team_categories_are_parsed(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    categories = {m.category for m in db.scalars(select(TeamMember)).all()}

    assert categories == {TeamCategory.CORE, TeamCategory.FACULTY}


def test_ieee_day_children_are_imported(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()

    edition = db.scalar(select(IeeeDayEdition))

    assert edition.is_current is True
    assert [(s.label, s.value) for s in edition.stats] == [("Participants", "450")]
    assert [h.title for h in edition.highlights] == ["Keynote"]


def test_dry_run_changes_nothing(db: Session, content_dir: Path):
    report = ContentSync(db, content_dir).import_all(dry_run=True)

    assert report.total_changes > 0
    assert db.scalars(select(TeamMember)).all() == []


def test_removing_a_file_does_not_delete_the_row_by_default(db: Session, content_dir: Path):
    sync = ContentSync(db, content_dir)
    sync.import_all()

    (content_dir / "blogs" / "a-draft.md").unlink()
    sync.import_all()

    assert db.scalar(select(BlogPost).where(BlogPost.slug == "a-draft")) is not None


def test_prune_removes_rows_whose_files_are_gone(db: Session, content_dir: Path):
    sync = ContentSync(db, content_dir)
    sync.import_all()

    (content_dir / "blogs" / "a-draft.md").unlink()
    report = sync.import_all(prune=True)

    assert db.scalar(select(BlogPost).where(BlogPost.slug == "a-draft")) is None
    assert report.deleted.get("blog post") == 1


def test_prune_refuses_to_empty_a_table_when_a_file_is_missing(db: Session, content_dir: Path):
    sync = ContentSync(db, content_dir)
    sync.import_all()

    (content_dir / "team.yaml").write_text("")
    report = sync.import_all(prune=True)

    assert len(db.scalars(select(TeamMember)).all()) == 2
    assert any("team member" in warning for warning in report.warnings)


def test_an_unknown_category_is_reported_as_a_warning(db: Session, content_dir: Path):
    (content_dir / "blogs" / "an-article.md").write_text(
        "---\ntitle: Orphan\nauthor: A\ncategory: nonexistent\n---\n\nBody.\n"
    )

    report = ContentSync(db, content_dir).import_all()

    assert any("nonexistent" in warning for warning in report.warnings)


def test_a_typo_in_a_field_name_is_an_error(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text("- name: A Person\n  positon: Chair\n  category: core\n")

    with pytest.raises(ContentError, match="positon"):
        ContentSync(db, content_dir).import_all()


def test_a_missing_required_field_is_an_error(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text("- position: Chairperson\n  category: core\n")

    with pytest.raises(ContentError, match="name"):
        ContentSync(db, content_dir).import_all()


def test_an_invalid_team_category_is_an_error(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text("- name: A Person\n  category: wizard\n")

    with pytest.raises(ContentError, match="category"):
        ContentSync(db, content_dir).import_all()


def test_malformed_yaml_is_an_error(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text("- name: [unclosed\n")

    with pytest.raises(ContentError, match=r"team\.yaml"):
        ContentSync(db, content_dir).import_all()


def test_a_post_without_frontmatter_is_an_error(db: Session, content_dir: Path):
    (content_dir / "blogs" / "an-article.md").write_text("Just a body, no frontmatter.\n")

    with pytest.raises(ContentError, match="frontmatter"):
        ContentSync(db, content_dir).import_all()


def test_a_date_written_the_long_way_is_accepted(db: Session, content_dir: Path):
    (content_dir / "events.yaml").write_text("- title: A Talk\n  date: 27 March 2026\n")

    ContentSync(db, content_dir).import_all()

    assert db.scalar(select(Event).where(Event.slug == "a-talk")).event_date == date(2026, 3, 27)


def test_an_unreadable_date_is_an_error(db: Session, content_dir: Path):
    (content_dir / "events.yaml").write_text("- title: A Talk\n  date: sometime next spring\n")

    with pytest.raises(ContentError, match="date"):
        ContentSync(db, content_dir).import_all()


def test_duplicate_ieee_day_stat_labels_are_an_error(db: Session, content_dir: Path):
    (content_dir / "ieee-day.yaml").write_text(
        "- year: 2026\n  stats:\n"
        "    - label: Participants\n      value: '1'\n"
        "    - label: Participants\n      value: '2'\n"
    )

    with pytest.raises(ContentError, match="Duplicate"):
        ContentSync(db, content_dir).import_all()


def test_a_missing_content_directory_is_an_error(db: Session, tmp_path: Path):
    with pytest.raises(ContentError, match="No content directory"):
        ContentSync(db, tmp_path / "nope").import_all()


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def test_export_writes_every_file(db: Session, content_dir: Path, tmp_path: Path):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"

    ContentSync(db, destination).export_all()

    for name in (
        "site.yaml",
        "team.yaml",
        "alumni.yaml",
        "collaborations.yaml",
        "events.yaml",
        "ieee-day.yaml",
        "blogs/categories.yaml",
    ):
        assert (destination / name).is_file(), name
    assert (destination / "blogs" / "an-article.md").is_file()


def test_exported_content_reimports_to_the_same_state(
    db: Session, content_dir: Path, tmp_path: Path
):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()

    report = ContentSync(db, destination).import_all()

    assert report.created == {}
    assert report.updated == {}


def test_an_exported_post_keeps_its_body_and_metadata(
    db: Session, content_dir: Path, tmp_path: Path
):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()

    text = (destination / "blogs" / "an-article.md").read_text()

    assert "title: An Article" in text
    assert "author: An Author" in text
    assert "Some prose about engineering." in text


def test_an_exported_draft_stays_a_draft(db: Session, content_dir: Path, tmp_path: Path):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()

    assert "published: false" in (destination / "blogs" / "a-draft.md").read_text()
