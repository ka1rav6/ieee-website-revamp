"""The content/ import and export pipeline."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content.store import ContentError
from app.content.sync import SECTION_ORDER, ContentSync, resolve_sections
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
from app.services.blogs import to_summary


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


def test_reading_time_is_derived_and_a_missing_excerpt_is_not_stored(
    db: Session, content_dir: Path
):
    ContentSync(db, content_dir).import_all()

    article = db.scalar(select(BlogPost).where(BlogPost.slug == "an-article"))

    assert article.excerpt is None
    assert to_summary(article).excerpt
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


def test_editing_an_ieee_day_stat_value_reimports(db: Session, content_dir: Path):
    """Regression: replacing stats on re-import used to insert the new rows
    before deleting the old, tripping the unique (edition_id, label)
    constraint whenever a stat label was kept."""
    ContentSync(db, content_dir).import_all()

    (content_dir / "ieee-day.yaml").write_text(
        "- year: 2026\n"
        "  theme: A Theme\n"
        "  is_current: true\n"
        "  stats:\n"
        "    - label: Participants\n      value: '500'\n"
        "  highlights:\n"
        "    - title: Keynote\n      description: A talk.\n"
    )
    report = ContentSync(db, content_dir).import_all()

    edition = db.scalar(select(IeeeDayEdition))
    assert [(s.label, s.value) for s in edition.stats] == [("Participants", "500")]
    assert report.updated.get("ieee day") == 1


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


# ---------------------------------------------------------------------------
# Syncing one section at a time
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("members", "members"),
        ("team", "members"),
        ("Team", "members"),
        ("people", "members"),
        ("blogs", "blogs"),
        ("posts", "blogs"),
        ("sponsors", "collaborations"),
        ("ieee_day", "ieee-day"),
        ("IEEE-DAY", "ieee-day"),
    ],
)
def test_a_section_can_be_named_the_way_people_say_it(typed, expected):
    assert resolve_sections([typed]) == [expected]


def test_sections_run_in_dependency_order_whatever_order_they_are_given():
    # Posts name the category they belong to, so blogs cannot end up running
    # after whatever the caller happened to type first.
    assert resolve_sections(["members", "blogs"]) == resolve_sections(["blogs", "members"])


def test_no_sections_means_the_whole_tree():
    assert resolve_sections(None) == list(SECTION_ORDER)
    assert resolve_sections([]) == list(SECTION_ORDER)


def test_an_unknown_section_names_the_ones_that_exist():
    with pytest.raises(ContentError, match="members"):
        resolve_sections(["membres"])


def test_exporting_one_section_leaves_the_other_files_alone(
    db: Session, content_dir: Path, tmp_path: Path
):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()
    events_before = (destination / "events.yaml").read_text()

    # Something changed in the dashboard, in two different sections.
    db.scalar(select(TeamMember).where(TeamMember.name == "Anshul Kumar Singh")).position = "Chair"
    db.scalars(select(Event)).first().description = "Edited."
    db.commit()

    ContentSync(db, destination).export_sections(["members"])

    assert "Chair" in (destination / "team.yaml").read_text()
    # The events file is untouched, so the diff is only ever what was asked for.
    assert (destination / "events.yaml").read_text() == events_before


def test_importing_one_section_leaves_the_other_tables_alone(db: Session, content_dir: Path):
    ContentSync(db, content_dir).import_all()
    (content_dir / "team.yaml").write_text(
        "- name: Anshul Kumar Singh\n  position: Vice Chair\n  category: core\n"
    )
    (content_dir / "alumni.yaml").write_text("- name: A Graduate\n  current_organization: Globex\n")

    ContentSync(db, content_dir).import_sections(["members"])

    member = db.scalar(select(TeamMember).where(TeamMember.slug == "anshul-kumar-singh"))
    assert member.position == "Vice Chair"
    # The alumni file changed too, but nobody asked for it to be loaded.
    alumnus = db.scalar(select(Alumnus).where(Alumnus.slug == "a-graduate"))
    assert alumnus.current_organization == "Acme"


def test_syncing_blogs_covers_categories_and_posts(db: Session, content_dir: Path, tmp_path: Path):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"

    ContentSync(db, destination).export_sections(["blogs"])

    assert (destination / "blogs" / "categories.yaml").is_file()
    assert (destination / "blogs" / "an-article.md").is_file()
    assert not (destination / "team.yaml").exists()


def test_a_post_deleted_in_the_dashboard_loses_its_file(
    db: Session, content_dir: Path, tmp_path: Path
):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()
    assert (destination / "blogs" / "a-draft.md").is_file()

    db.delete(db.scalar(select(BlogPost).where(BlogPost.slug == "a-draft")))
    db.commit()

    report = ContentSync(db, destination).export_sections(["blogs"])

    # Left on disk it would be reimported on the next run, undoing the delete.
    assert not (destination / "blogs" / "a-draft.md").exists()
    assert (destination / "blogs" / "an-article.md").is_file()
    assert report.deleted == {"blog post": 1}


def test_an_empty_blog_table_does_not_empty_the_blogs_directory(
    db: Session, content_dir: Path, tmp_path: Path
):
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()

    for post in db.scalars(select(BlogPost)).all():
        db.delete(post)
    db.commit()

    ContentSync(db, destination).export_sections(["blogs"])

    # No posts at all is far more likely to be the wrong database than a
    # decision to delete every article, so the files stay put.
    assert (destination / "blogs" / "an-article.md").is_file()
    assert (destination / "blogs" / "a-draft.md").is_file()


# ---------------------------------------------------------------------------
# Duplicate slugs within one file
#
# A content file is a set of entries keyed by slug. Two entries that derive the
# same slug used to insert a duplicate and blow up on the unique index (or, on
# a session with autoflush, silently collapse into one row). Each importer now
# disambiguates repeats so every entry gets its own stable slug.
# ---------------------------------------------------------------------------


def test_duplicate_team_names_get_distinct_slugs(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text(
        "- name: Same Person\n  category: core\n- name: Same Person\n  category: executive\n"
    )

    report = ContentSync(db, content_dir).import_all()

    slugs = sorted(m.slug for m in db.scalars(select(TeamMember)).all())
    assert slugs == ["same-person", "same-person-2"]
    assert report.created.get("team member") == 2


def test_duplicate_alumni_names_get_distinct_slugs(db: Session, content_dir: Path):
    (content_dir / "alumni.yaml").write_text(
        "- name: Same Alum\n  graduation_year: 2023\n- name: Same Alum\n  graduation_year: 2024\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(a.slug for a in db.scalars(select(Alumnus)).all())
    assert slugs == ["same-alum", "same-alum-2"]


def test_duplicate_collaboration_names_get_distinct_slugs(db: Session, content_dir: Path):
    (content_dir / "collaborations.yaml").write_text(
        "- name: Acme\n  year: 2024\n- name: Acme\n  year: 2025\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(c.slug for c in db.scalars(select(Collaboration)).all())
    assert slugs == ["acme", "acme-2"]


def test_duplicate_blog_category_names_get_distinct_slugs(db: Session, content_dir: Path):
    (content_dir / "blogs" / "categories.yaml").write_text(
        "- name: Tech Affairs\n- name: Tech Affairs\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(c.slug for c in db.scalars(select(BlogCategory)).all())
    assert slugs == ["tech-affairs", "tech-affairs-2"]


def test_explicit_duplicate_slugs_in_a_file_are_still_kept_distinct(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text(
        "- name: Alpha\n  category: core\n  slug: person\n"
        "- name: Beta\n  category: core\n  slug: person\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(m.slug for m in db.scalars(select(TeamMember)).all())
    assert slugs == ["person", "person-2"]


def test_duplicate_post_frontmatter_slugs_get_distinct_urls(db: Session, content_dir: Path):
    (content_dir / "blogs" / "one.md").write_text(
        "---\ntitle: One\nslug: shared\nauthor: A\n---\n\nFirst body.\n"
    )
    (content_dir / "blogs" / "two.md").write_text(
        "---\ntitle: Two\nslug: shared\nauthor: A\n---\n\nSecond body.\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = {p.slug for p in db.scalars(select(BlogPost)).all()}
    assert {"shared", "shared-2"} <= slugs


def test_duplicate_event_titles_in_the_same_year_get_distinct_slugs(db: Session, content_dir: Path):
    """Regression: two same-title events in one year both got `-<year>` and
    collided."""
    (content_dir / "events.yaml").write_text(
        "- title: Slash\n  date: 2026-03-13\n- title: Slash\n  date: 2026-09-01\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(e.slug for e in db.scalars(select(Event)).all())
    assert slugs == ["slash", "slash-2026"]


def test_a_third_duplicate_event_falls_back_to_a_counter(db: Session, content_dir: Path):
    (content_dir / "events.yaml").write_text(
        "- title: Slash\n  date: 2026-03-13\n"
        "- title: Slash\n  date: 2026-09-01\n"
        "- title: Slash\n  date: 2026-11-01\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(e.slug for e in db.scalars(select(Event)).all())
    assert slugs == ["slash", "slash-2026", "slash-2026-2"]


def test_duplicate_events_without_a_date_still_get_distinct_slugs(db: Session, content_dir: Path):
    (content_dir / "events.yaml").write_text("- title: Repeat\n- title: Repeat\n")

    ContentSync(db, content_dir).import_all()

    slugs = sorted(e.slug for e in db.scalars(select(Event)).all())
    assert slugs == ["repeat", "repeat-2"]


def test_events_sharing_a_title_across_three_years_use_each_year(db: Session, content_dir: Path):
    (content_dir / "events.yaml").write_text(
        "- title: Slash\n  date: 2026-03-13\n"
        "- title: Slash\n  date: 2023-04-19\n"
        "- title: Slash\n  date: 2024-05-01\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = sorted(e.slug for e in db.scalars(select(Event)).all())
    assert slugs == ["slash", "slash-2023", "slash-2024"]


def test_a_duplicate_slug_still_respects_the_column_length(db: Session, content_dir: Path):
    # The longest a name may be; its slug fills the 160-char column, so the
    # disambiguating suffix has to be trimmed in rather than appended past it.
    long_name = "a" * 160
    (content_dir / "team.yaml").write_text(
        f"- name: '{long_name}'\n  category: core\n- name: '{long_name}'\n  category: core\n"
    )

    ContentSync(db, content_dir).import_all()

    slugs = [m.slug for m in db.scalars(select(TeamMember)).all()]
    assert len(slugs) == 2
    assert len(set(slugs)) == 2
    assert all(len(slug) <= 160 for slug in slugs)


def test_a_name_with_no_usable_characters_still_gets_a_slug(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text("- name: '!!!'\n  category: core\n")

    ContentSync(db, content_dir).import_all()

    assert db.scalar(select(TeamMember)).slug == "item"


def test_reimporting_a_file_with_duplicates_is_idempotent(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text(
        "- name: Same\n  category: core\n- name: Same\n  category: mentor\n"
    )
    sync = ContentSync(db, content_dir)
    sync.import_all()

    second = sync.import_all()

    assert second.created == {}
    assert second.updated == {}
    assert second.deleted == {}
    assert second.unchanged.get("team member") == 2


def test_prune_keeps_every_duplicate_rather_than_dropping_one(db: Session, content_dir: Path):
    (content_dir / "team.yaml").write_text(
        "- name: Same\n  category: core\n- name: Same\n  category: mentor\n"
    )

    report = ContentSync(db, content_dir).import_all(prune=True)

    assert len(db.scalars(select(TeamMember)).all()) == 2
    assert report.deleted.get("team member") is None


def test_duplicate_rows_survive_an_export_and_reimport(
    db: Session, content_dir: Path, tmp_path: Path
):
    (content_dir / "team.yaml").write_text(
        "- name: Same\n  category: core\n- name: Same\n  category: mentor\n"
    )
    ContentSync(db, content_dir).import_all()
    destination = tmp_path / "exported"
    ContentSync(db, destination).export_all()

    report = ContentSync(db, destination).import_all()

    assert report.created == {}
    assert report.updated == {}
