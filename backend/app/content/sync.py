"""Synchronise `content/` with the database.

`import` upserts every file into the database, keyed by slug, and is safe to
run repeatedly. `export` writes the database back out so that edits made in
the admin dashboard can be reviewed and committed like any other change.

Import is additive by default: rows that no longer appear in the files are
left alone unless `--prune` is passed, so running the importer can never
quietly delete content someone added through the dashboard.

Both directions can be narrowed to one section of the tree. That is what
makes the dashboard usable as a drafting tool: edit the roster all afternoon,
then pull back just the roster, leaving everything else in `content/`
untouched and the diff small enough to actually read.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.content.models import (
    AlumnusFile,
    BlogCategoryFile,
    BlogPostFile,
    CollaborationFile,
    EventFile,
    IeeeDayEditionFile,
    TeamMemberFile,
)
from app.content.store import (
    ContentError,
    ContentPaths,
    read_yaml_list,
    read_yaml_mapping,
    split_frontmatter,
    write_markdown,
    write_yaml,
)
from app.models.content import (
    Alumnus,
    BlogCategory,
    BlogPost,
    BlogTag,
    Collaboration,
    Event,
    IeeeDayEdition,
    IeeeDayHighlight,
    IeeeDayPhoto,
    IeeeDayStat,
    SiteSetting,
    TeamMember,
)
from app.services.text import reading_minutes, slugify


@dataclass
class SyncReport:
    """What a run did, so the CLI can print a useful summary."""

    created: dict[str, int] = field(default_factory=dict)
    updated: dict[str, int] = field(default_factory=dict)
    deleted: dict[str, int] = field(default_factory=dict)
    unchanged: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def record(self, kind: str, action: str) -> None:
        bucket = getattr(self, action)
        bucket[kind] = bucket.get(kind, 0) + 1

    @property
    def total_changes(self) -> int:
        return sum(self.created.values()) + sum(self.updated.values()) + sum(self.deleted.values())

    def lines(self) -> list[str]:
        kinds = sorted(
            set(self.created) | set(self.updated) | set(self.deleted) | set(self.unchanged)
        )
        rows = []
        for kind in kinds:
            rows.append(
                f"  {kind:16} "
                f"created {self.created.get(kind, 0):4}  "
                f"updated {self.updated.get(kind, 0):4}  "
                f"deleted {self.deleted.get(kind, 0):4}  "
                f"unchanged {self.unchanged.get(kind, 0):4}"
            )
        return rows


def _header(body: str, section: str) -> str:
    """A file header that says how this file travels to and from the database.

    These files are the editing surface for people who may never open the
    code, so each one carries its own instructions - including the warning
    that a sync regenerates it, since comments written here do not survive.
    """
    return (
        f"{body}\n"
        f"Edit here, then `just content-import {section}`. Edit in the dashboard,\n"
        f"then `just dbsync {section}` to pull it back - which rewrites this file."
    )


def _validate[T](model: type[T], data: dict[str, Any], source: str, index: int | None = None) -> T:
    """Validate one entry, reporting where in the file the problem is."""
    try:
        return model(**data)
    except ValidationError as exc:
        where = f"{source} entry {index}" if index is not None else source
        problems = "; ".join(
            f"{'.'.join(str(p) for p in err['loc']) or 'entry'}: {err['msg']}"
            for err in exc.errors()
        )
        raise ContentError(f"{where}: {problems}") from exc


def _apply(record: Any, values: dict[str, Any]) -> bool:
    """Copy values onto a row, returning whether anything actually changed."""
    changed = False
    for key, value in values.items():
        if getattr(record, key) != value:
            setattr(record, key, value)
            changed = True
    return changed


def _unique_slug(
    candidate: str,
    taken: set[str],
    *,
    hint: object | None = None,
    max_length: int = 200,
) -> str:
    """A slug that is unique among the entries already seen in this file.

    Content files are authoritative and re-imported as a set, so a slug only
    has to be unique *within the file*: checking the database instead would
    make a repeated import renumber rows and stop being idempotent. The first
    occurrence keeps the plain slug; a repeat is disambiguated by an optional
    hint (an event's year), then by a counter, so two entries can never resolve
    to the same slug and collide on the unique index.
    """
    base = candidate or "item"
    if base not in taken:
        return base

    stems = []
    if hint is not None:
        stems.append(f"{base[: max_length - len(str(hint)) - 1]}-{hint}")
    stems.append(base)

    for stem in stems:
        if stem not in taken:
            return stem
        for suffix in range(2, 1000):
            numbered = f"{stem[: max_length - len(str(suffix)) - 1]}-{suffix}"
            if numbered not in taken:
                return numbered

    raise ContentError(f"Could not derive a unique slug from {candidate!r}")


# The addressable slices of the content tree, in the order they must be
# imported: blog posts reference categories, so `blogs` covers both and comes
# before anything that could depend on it.
SECTION_ORDER = (
    "settings",
    "blogs",
    "members",
    "alumni",
    "collaborations",
    "events",
    "ieee-day",
)

SECTION_FILES = {
    "settings": "site.yaml",
    "blogs": "blogs/categories.yaml and blogs/*.md",
    "members": "team.yaml",
    "alumni": "alumni.yaml",
    "collaborations": "collaborations.yaml",
    "events": "events.yaml",
    "ieee-day": "ieee-day.yaml",
}

# What people actually type. Nobody should have to remember whether the
# section is called "team" or "members".
SECTION_ALIASES = {
    "team": "members",
    "member": "members",
    "roster": "members",
    "people": "members",
    "blog": "blogs",
    "post": "blogs",
    "posts": "blogs",
    "articles": "blogs",
    "alumnus": "alumni",
    "collab": "collaborations",
    "collabs": "collaborations",
    "collaboration": "collaborations",
    "sponsors": "collaborations",
    "partners": "collaborations",
    "event": "events",
    "ieeeday": "ieee-day",
    "site": "settings",
    "setting": "settings",
}


def resolve_sections(names: Sequence[str] | None) -> list[str]:
    """Turn what was typed on the command line into section names.

    An empty selection means the whole tree. Whatever order the names are
    given in, the result is in dependency order, so `import blogs members`
    and `import members blogs` do the same thing.
    """
    if not names:
        return list(SECTION_ORDER)

    chosen: set[str] = set()
    for raw in names:
        key = raw.strip().lower().replace("_", "-")
        key = SECTION_ALIASES.get(key, key)
        if key not in SECTION_ORDER:
            raise ContentError(f"Unknown section '{raw}'. Pick from: {', '.join(SECTION_ORDER)}.")
        chosen.add(key)
    return [name for name in SECTION_ORDER if name in chosen]


class ContentSync:
    """Imports and exports `content/`, in whole or one section at a time."""

    def __init__(self, db: Session, root: Path) -> None:
        self.db = db
        self.paths = ContentPaths(root)

    # -- import ------------------------------------------------------------

    def import_all(self, *, prune: bool = False, dry_run: bool = False) -> SyncReport:
        """Load the whole of `content/` into the database."""
        return self.import_sections(None, prune=prune, dry_run=dry_run)

    def import_sections(
        self,
        sections: Sequence[str] | None,
        *,
        prune: bool = False,
        dry_run: bool = False,
    ) -> SyncReport:
        """Load the named sections of `content/`; all of it when none given."""
        report = SyncReport()
        if not self.paths.root.is_dir():
            raise ContentError(f"No content directory at {self.paths.root}")

        importers = {
            "settings": self._import_settings,
            "blogs": self._import_blogs,
            "members": self._import_team,
            "alumni": self._import_alumni,
            "collaborations": self._import_collaborations,
            "events": self._import_events,
            "ieee-day": self._import_ieee_day,
        }
        for name in resolve_sections(sections):
            importers[name](report, prune=prune)

        if dry_run:
            self.db.rollback()
        else:
            self.db.commit()
        return report

    def _import_blogs(self, report: SyncReport, *, prune: bool) -> None:
        """Categories first: a post names the category it belongs to."""
        self._import_blog_categories(report, prune=prune)
        self._import_blog_posts(report, prune=prune)

    def _import_settings(self, report: SyncReport, *, prune: bool = False) -> None:
        # Settings are a fixed set of keys rather than a list of rows, so
        # there is nothing here for --prune to act on.
        del prune
        values = read_yaml_mapping(self.paths.site)
        for key, value in values.items():
            text = "" if value is None else str(value)
            existing = self.db.get(SiteSetting, key)
            if existing is None:
                self.db.add(SiteSetting(key=key, value=text))
                report.record("settings", "created")
            elif existing.value != text:
                existing.value = text
                report.record("settings", "updated")
            else:
                report.record("settings", "unchanged")

    def _import_blog_categories(self, report: SyncReport, *, prune: bool) -> None:
        entries = read_yaml_list(self.paths.blog_categories)
        seen: set[str] = set()
        for index, raw in enumerate(entries, start=1):
            item = _validate(BlogCategoryFile, raw, self.paths.blog_categories.name, index)
            slug = _unique_slug(
                slugify(item.slug or item.name, max_length=120), seen, max_length=120
            )
            seen.add(slug)
            values = {
                "name": item.name,
                "description": item.description,
                "sort_order": index - 1,
            }
            existing = self.db.scalar(select(BlogCategory).where(BlogCategory.slug == slug))
            if existing is None:
                self.db.add(BlogCategory(slug=slug, **values))
                report.record("blog category", "created")
            else:
                report.record(
                    "blog category", "updated" if _apply(existing, values) else "unchanged"
                )

        self.db.flush()
        if prune:
            self._prune(BlogCategory, seen, "blog category", report)

    def _import_blog_posts(self, report: SyncReport, *, prune: bool) -> None:
        seen: set[str] = set()
        for path in self.paths.blog_posts():
            meta, body = split_frontmatter(path.read_text(encoding="utf-8"), source=path.name)
            item = _validate(BlogPostFile, meta, path.name)
            # The filename is the canonical slug, so renaming a file renames
            # the URL and nothing else has to be kept in step. A frontmatter
            # slug that repeats another post is still kept distinct.
            slug = _unique_slug(
                slugify(item.slug or path.stem, max_length=220), seen, max_length=220
            )
            seen.add(slug)

            category = None
            if item.category:
                category_slug = slugify(item.category, max_length=120)
                category = self.db.scalar(
                    select(BlogCategory).where(BlogCategory.slug == category_slug)
                )
                if category is None:
                    report.warnings.append(
                        f"{path.name}: unknown category '{item.category}'. "
                        "Add it to content/blogs/categories.yaml."
                    )

            values = {
                "title": item.title,
                "body": body,
                # Only an authored excerpt is stored; a derived one is worked
                # out when the post is read, so it never goes stale and never
                # gets written back into the file on export.
                "excerpt": item.excerpt,
                "cover_image": item.cover_image,
                "cover_image_alt": item.cover_image_alt,
                "author_name": item.author,
                "author_subtitle": item.author_subtitle,
                "author_image": item.author_image,
                "is_published": item.published,
                "is_featured": item.featured,
                "published_at": item.date,
                "reading_minutes": reading_minutes(body),
                "category_id": category.id if category else None,
            }

            existing = self.db.scalar(
                select(BlogPost).options(selectinload(BlogPost.tags)).where(BlogPost.slug == slug)
            )
            tags = self._resolve_tags(item.tags)
            if existing is None:
                post = BlogPost(slug=slug, **values)
                post.tags = tags
                self.db.add(post)
                report.record("blog post", "created")
            else:
                changed = _apply(existing, values)
                if {t.slug for t in existing.tags} != {t.slug for t in tags}:
                    existing.tags = tags
                    changed = True
                report.record("blog post", "updated" if changed else "unchanged")

        self.db.flush()
        if prune:
            self._prune(BlogPost, seen, "blog post", report)

    def _resolve_tags(self, names: list[str]) -> list[BlogTag]:
        tags: list[BlogTag] = []
        for raw in names:
            name = raw.strip()
            slug = slugify(name, max_length=80)
            if not slug:
                continue
            tag = self.db.scalar(select(BlogTag).where(BlogTag.slug == slug))
            if tag is None:
                tag = BlogTag(slug=slug, name=name)
                self.db.add(tag)
                self.db.flush()
            tags.append(tag)
        return tags

    def _import_team(self, report: SyncReport, *, prune: bool) -> None:
        entries = read_yaml_list(self.paths.team)
        seen: set[str] = set()
        for index, raw in enumerate(entries, start=1):
            item = _validate(TeamMemberFile, raw, self.paths.team.name, index)
            slug = _unique_slug(
                slugify(item.slug or item.name, max_length=160), seen, max_length=160
            )
            seen.add(slug)
            values = {
                "name": item.name,
                "position": item.position,
                "category": item.category,
                "photo": item.photo,
                "department": item.department,
                "year": item.year,
                "bio": item.bio,
                "email": item.email,
                "linkedin_url": item.linkedin_url,
                "github_url": item.github_url,
                "website_url": item.website_url,
                "term": item.term,
                "is_active": item.is_active,
                # File order is display order, so reordering the YAML
                # reorders the page.
                "sort_order": index - 1,
            }
            existing = self.db.scalar(select(TeamMember).where(TeamMember.slug == slug))
            if existing is None:
                self.db.add(TeamMember(slug=slug, **values))
                report.record("team member", "created")
            else:
                report.record("team member", "updated" if _apply(existing, values) else "unchanged")

        self.db.flush()
        if prune:
            self._prune(TeamMember, seen, "team member", report)

    def _import_alumni(self, report: SyncReport, *, prune: bool) -> None:
        entries = read_yaml_list(self.paths.alumni)
        seen: set[str] = set()
        for index, raw in enumerate(entries, start=1):
            item = _validate(AlumnusFile, raw, self.paths.alumni.name, index)
            slug = _unique_slug(
                slugify(item.slug or item.name, max_length=160), seen, max_length=160
            )
            seen.add(slug)
            values = {
                "name": item.name,
                "photo": item.photo,
                "graduation_year": item.graduation_year,
                "degree": item.degree,
                "branch": item.branch,
                "current_role": item.current_role,
                "current_organization": item.current_organization,
                "ieee_position": item.ieee_position,
                "linkedin_url": item.linkedin_url,
                "github_url": item.github_url,
                "website_url": item.website_url,
                "is_featured": item.is_featured,
                "sort_order": index - 1,
            }
            existing = self.db.scalar(select(Alumnus).where(Alumnus.slug == slug))
            if existing is None:
                self.db.add(Alumnus(slug=slug, **values))
                report.record("alumnus", "created")
            else:
                report.record("alumnus", "updated" if _apply(existing, values) else "unchanged")

        self.db.flush()
        if prune:
            self._prune(Alumnus, seen, "alumnus", report)

    def _import_collaborations(self, report: SyncReport, *, prune: bool) -> None:
        entries = read_yaml_list(self.paths.collaborations)
        seen: set[str] = set()
        for index, raw in enumerate(entries, start=1):
            item = _validate(CollaborationFile, raw, self.paths.collaborations.name, index)
            slug = _unique_slug(
                slugify(item.slug or item.name, max_length=160), seen, max_length=160
            )
            seen.add(slug)
            values = {
                "name": item.name,
                "logo": item.logo,
                "description": item.description,
                "collaboration_type": item.collaboration_type,
                "year": item.year,
                "website_url": item.website_url,
                "is_featured": item.is_featured,
                "sort_order": index - 1,
            }
            existing = self.db.scalar(select(Collaboration).where(Collaboration.slug == slug))
            if existing is None:
                self.db.add(Collaboration(slug=slug, **values))
                report.record("collaboration", "created")
            else:
                report.record(
                    "collaboration", "updated" if _apply(existing, values) else "unchanged"
                )

        self.db.flush()
        if prune:
            self._prune(Collaboration, seen, "collaboration", report)

    def _import_events(self, report: SyncReport, *, prune: bool) -> None:
        entries = read_yaml_list(self.paths.events)
        seen: set[str] = set()
        for index, raw in enumerate(entries, start=1):
            item = _validate(EventFile, raw, self.paths.events.name, index)
            # Several events share a title across years (Slash, Xgrid), so a
            # repeat slug is disambiguated with the year - and then with a
            # counter, since a title can repeat within one year too.
            slug = _unique_slug(
                slugify(item.slug or item.title, max_length=220),
                seen,
                hint=item.date.year if item.date else index,
                max_length=220,
            )
            seen.add(slug)
            values = {
                "title": item.title,
                "description": item.description,
                "poster": item.poster,
                "event_date": item.date,
                "location": item.location,
                "category": item.category,
                "registration_url": item.registration_url,
                "ieee_day_year": item.ieee_day_year,
                "is_featured": item.is_featured,
                "is_published": item.is_published,
                "sort_order": index - 1,
            }
            existing = self.db.scalar(select(Event).where(Event.slug == slug))
            if existing is None:
                self.db.add(Event(slug=slug, **values))
                report.record("event", "created")
            else:
                report.record("event", "updated" if _apply(existing, values) else "unchanged")

        self.db.flush()
        if prune:
            self._prune(Event, seen, "event", report)

    def _import_ieee_day(self, report: SyncReport, *, prune: bool) -> None:
        entries = read_yaml_list(self.paths.ieee_day)
        seen_years: set[int] = set()
        for index, raw in enumerate(entries, start=1):
            item = _validate(IeeeDayEditionFile, raw, self.paths.ieee_day.name, index)
            seen_years.add(item.year)
            values = {
                "theme": item.theme,
                "tagline": item.tagline,
                "description": item.description,
                "celebrated_on": item.celebrated_on,
                "hero_image": item.hero_image,
                "is_current": item.is_current,
            }
            edition = self.db.scalar(
                select(IeeeDayEdition)
                .options(
                    selectinload(IeeeDayEdition.highlights),
                    selectinload(IeeeDayEdition.stats),
                    selectinload(IeeeDayEdition.gallery),
                )
                .where(IeeeDayEdition.year == item.year)
            )
            created = edition is None
            fields_changed = False
            if edition is None:
                edition = IeeeDayEdition(year=item.year, **values)
                self.db.add(edition)
            else:
                fields_changed = _apply(edition, values)

            # Child rows are small and authored as a set, so replacing them
            # wholesale is clearer than diffing. They are compared first so
            # that an unchanged edition is still reported as unchanged.
            children_changed = (
                [(h.title, h.description, h.image) for h in edition.highlights]
                != [(h.title, h.description, h.image) for h in item.highlights]
                or [(s.label, s.value) for s in edition.stats]
                != [(s.label, s.value) for s in item.stats]
                or [(g.image, g.caption) for g in edition.gallery]
                != [(g.image, g.caption) for g in item.gallery]
            )
            if children_changed:
                # Clear and flush before adding the replacements, so the
                # DELETEs reach the database before the INSERTs. A stat keeps
                # its label across an edit, so inserting the new row before the
                # old one is deleted would trip the (edition_id, label) unique
                # constraint. A newly created edition has nothing to order.
                edition.highlights = []
                edition.stats = []
                edition.gallery = []
                if edition.id is not None:
                    self.db.flush()

                edition.highlights = [
                    IeeeDayHighlight(
                        title=h.title, description=h.description, image=h.image, sort_order=i
                    )
                    for i, h in enumerate(item.highlights)
                ]
                edition.stats = [
                    IeeeDayStat(label=s.label, value=s.value, sort_order=i)
                    for i, s in enumerate(item.stats)
                ]
                edition.gallery = [
                    IeeeDayPhoto(image=g.image, caption=g.caption, sort_order=i)
                    for i, g in enumerate(item.gallery)
                ]

            if created:
                report.record("ieee day", "created")
            elif fields_changed or children_changed:
                report.record("ieee day", "updated")
            else:
                report.record("ieee day", "unchanged")

        self.db.flush()
        if prune and seen_years:
            stale = self.db.scalars(
                select(IeeeDayEdition).where(IeeeDayEdition.year.notin_(seen_years))
            ).all()
            for edition in stale:
                self.db.delete(edition)
                report.record("ieee day", "deleted")

    def _prune(self, model: Any, keep: set[str], kind: str, report: SyncReport) -> None:
        """Delete rows whose slug is absent from the content files.

        Skipped when the file set is empty, so an accidentally emptied or
        missing file cannot wipe a table.
        """
        if not keep:
            report.warnings.append(f"No {kind} entries found in content/, so nothing was pruned.")
            return
        stale = self.db.scalars(select(model).where(model.slug.notin_(keep))).all()
        for record in stale:
            self.db.delete(record)
            report.record(kind, "deleted")

    # -- export ------------------------------------------------------------

    def export_all(self) -> SyncReport:
        """Write the whole database out to `content/`."""
        return self.export_sections(None)

    def export_sections(self, sections: Sequence[str] | None) -> SyncReport:
        """Write the named sections out to `content/`; all of them when none.

        Narrowing matters here in a way it does not for import: export
        rewrites whole files, so pulling the roster back should not also
        reformat every blog post and reorder the events list.
        """
        report = SyncReport()
        self.paths.root.mkdir(parents=True, exist_ok=True)

        exporters = {
            "settings": self._export_settings,
            "blogs": self._export_blogs,
            "members": self._export_team,
            "alumni": self._export_alumni,
            "collaborations": self._export_collaborations,
            "events": self._export_events,
            "ieee-day": self._export_ieee_day,
        }
        for name in resolve_sections(sections):
            exporters[name](report)
        return report

    def _export_blogs(self, report: SyncReport) -> None:
        self._export_blog_categories(report)
        self._export_blog_posts(report)

    def _export_settings(self, report: SyncReport) -> None:
        values = {
            row.key: row.value
            for row in self.db.scalars(select(SiteSetting).order_by(SiteSetting.key))
        }
        write_yaml(
            self.paths.site,
            values,
            header=_header(
                "Editable site copy and links.\n"
                "Also editable in the admin dashboard under Settings.\n"
                "`hero_heading` takes two bits of markup: a line break breaks the line,\n"
                "and *asterisks* around a word give it the halftone-dot treatment.\n"
                "`hero_meta` and `hero_status` are hidden while empty.\n"
                'Perks: one per line, as "Short title | the sentence under it".',
                "settings",
            ),
        )
        report.record("settings", "updated")

    def _export_blog_categories(self, report: SyncReport) -> None:
        rows = self.db.scalars(
            select(BlogCategory).order_by(BlogCategory.sort_order, BlogCategory.name)
        ).all()
        write_yaml(
            self.paths.blog_categories,
            [
                _compact({"name": c.name, "slug": c.slug, "description": c.description})
                for c in rows
            ],
            header=_header(
                "Blog categories. List order is display order on /blogs.\n"
                "A post's `category:` must match one of these slugs.",
                "blogs",
            ),
        )
        report.record("blog category", "updated")

    def _export_blog_posts(self, report: SyncReport) -> None:
        posts = self.db.scalars(
            select(BlogPost).options(selectinload(BlogPost.category), selectinload(BlogPost.tags))
        ).all()
        for post in posts:
            meta = _compact(
                {
                    "title": post.title,
                    "author": post.author_name,
                    "author_subtitle": post.author_subtitle,
                    "author_image": post.author_image,
                    "category": post.category.slug if post.category else None,
                    # Tags are an unordered set in the database, so they are
                    # written sorted to keep repeated exports byte-identical.
                    "tags": sorted(tag.name for tag in post.tags),
                    "date": post.published_at,
                    "excerpt": post.excerpt,
                    "cover_image": post.cover_image,
                    "cover_image_alt": post.cover_image_alt,
                    "published": post.is_published,
                    "featured": post.is_featured,
                }
            )
            # `published` and `featured` are meaningful when False, so they
            # are restored after _compact drops falsy values.
            meta["published"] = post.is_published
            meta["featured"] = post.is_featured
            write_markdown(self.paths.blogs_dir / f"{post.slug}.md", meta, post.body)
            report.record("blog post", "updated")

        # A post deleted in the dashboard has to take its file with it, or
        # the next import would bring it straight back. Skipped entirely when
        # the database holds no posts at all, since that is far more likely to
        # be the wrong database than a decision to delete every article.
        if posts:
            written = {f"{post.slug}.md" for post in posts}
            for path in self.paths.blog_posts():
                if path.name not in written:
                    path.unlink()
                    report.record("blog post", "deleted")

    def _export_team(self, report: SyncReport) -> None:
        members = self.db.scalars(
            select(TeamMember).order_by(TeamMember.sort_order, TeamMember.name)
        ).all()
        write_yaml(
            self.paths.team,
            [
                _compact(
                    {
                        "name": m.name,
                        "slug": m.slug,
                        "position": m.position,
                        "category": m.category.value,
                        "photo": m.photo,
                        "department": m.department,
                        "year": m.year,
                        "bio": m.bio,
                        "email": m.email,
                        "linkedin_url": m.linkedin_url,
                        "github_url": m.github_url,
                        "website_url": m.website_url,
                        "term": m.term,
                        "is_active": m.is_active if not m.is_active else None,
                    }
                )
                for m in members
            ],
            header=_header(
                "Team roster. List order is display order within each category.\n"
                "Categories: faculty, core, executive, mentor.",
                "members",
            ),
        )
        for _ in members:
            report.record("team member", "updated")

    def _export_alumni(self, report: SyncReport) -> None:
        alumni = self.db.scalars(select(Alumnus).order_by(Alumnus.sort_order, Alumnus.name)).all()
        write_yaml(
            self.paths.alumni,
            [
                _compact(
                    {
                        "name": a.name,
                        "slug": a.slug,
                        "photo": a.photo,
                        "graduation_year": a.graduation_year,
                        "degree": a.degree,
                        "branch": a.branch,
                        "current_role": a.current_role,
                        "current_organization": a.current_organization,
                        "ieee_position": a.ieee_position,
                        "linkedin_url": a.linkedin_url,
                        "github_url": a.github_url,
                        "website_url": a.website_url,
                        "is_featured": a.is_featured or None,
                    }
                )
                for a in alumni
            ],
            header=_header(
                "Alumni. Only publicly shareable details belong here.\n"
                "Graduation years are blank where the previous site did not record them.",
                "alumni",
            ),
        )
        for _ in alumni:
            report.record("alumnus", "updated")

    def _export_collaborations(self, report: SyncReport) -> None:
        rows = self.db.scalars(
            select(Collaboration).order_by(Collaboration.sort_order, Collaboration.name)
        ).all()
        write_yaml(
            self.paths.collaborations,
            [
                _compact(
                    {
                        "name": c.name,
                        "slug": c.slug,
                        "logo": c.logo,
                        "description": c.description,
                        "collaboration_type": c.collaboration_type,
                        "year": c.year,
                        "website_url": c.website_url,
                        "is_featured": c.is_featured or None,
                    }
                )
                for c in rows
            ],
            header=_header(
                "Industry collaborations. List order is display order.\n"
                "Optional per entry: `collaboration_type` (Sponsor, Workshop partner,\n"
                "Speaker, Prize partner) and `year` - the previous site never recorded them.",
                "collaborations",
            ),
        )
        for _ in rows:
            report.record("collaboration", "updated")

    def _export_events(self, report: SyncReport) -> None:
        events = self.db.scalars(
            select(Event).order_by(Event.event_date.desc().nulls_last(), Event.sort_order)
        ).all()
        write_yaml(
            self.paths.events,
            [
                _compact(
                    {
                        "title": e.title,
                        "slug": e.slug,
                        "date": e.event_date,
                        "description": e.description,
                        "poster": e.poster,
                        "location": e.location,
                        "category": e.category,
                        "registration_url": e.registration_url,
                        "ieee_day_year": e.ieee_day_year,
                        "is_featured": e.is_featured or None,
                        "is_published": None if e.is_published else False,
                    }
                )
                for e in events
            ],
            header=_header(
                "Events, newest first. Dates are YYYY-MM-DD.\n"
                "`is_featured: true` surfaces an event on the landing page;\n"
                "`ieee_day_year: 2026` lists it under that IEEE Day edition.",
                "events",
            ),
        )
        for _ in events:
            report.record("event", "updated")

    def _export_ieee_day(self, report: SyncReport) -> None:
        editions = self.db.scalars(
            select(IeeeDayEdition)
            .options(
                selectinload(IeeeDayEdition.highlights),
                selectinload(IeeeDayEdition.stats),
                selectinload(IeeeDayEdition.gallery),
            )
            .order_by(IeeeDayEdition.year.desc())
        ).all()
        write_yaml(
            self.paths.ieee_day,
            [
                _compact(
                    {
                        "year": e.year,
                        "theme": e.theme,
                        "tagline": e.tagline,
                        "celebrated_on": e.celebrated_on,
                        "hero_image": e.hero_image,
                        "is_current": e.is_current or None,
                        "description": e.description,
                        "stats": [{"label": s.label, "value": s.value} for s in e.stats],
                        "highlights": [
                            _compact(
                                {"title": h.title, "description": h.description, "image": h.image}
                            )
                            for h in e.highlights
                        ],
                        "gallery": [
                            _compact({"image": p.image, "caption": p.caption}) for p in e.gallery
                        ],
                    }
                )
                for e in editions
            ],
            header=_header(
                "IEEE Day editions, newest first.\n"
                "`stats`, `highlights` and `gallery` are optional; the page omits any\n"
                "section with no content, so a partial entry still looks intentional.",
                "ieee-day",
            ),
        )
        for _ in editions:
            report.record("ieee day", "updated")


def _compact(data: dict[str, Any]) -> dict[str, Any]:
    """Drop keys with no value, so exported files stay readable."""
    return {k: v for k, v in data.items() if v not in (None, "", [], {})}
