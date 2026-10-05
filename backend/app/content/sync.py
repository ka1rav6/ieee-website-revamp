"""Synchronise `content/` with the database.

`import` upserts every file into the database, keyed by slug, and is safe to
run repeatedly. `export` writes the database back out so that edits made in
the admin dashboard can be reviewed and committed like any other change.

Import is additive by default: rows that no longer appear in the files are
left alone unless `--prune` is passed, so running the importer can never
quietly delete content someone added through the dashboard.
"""

from __future__ import annotations

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
from app.services.text import build_excerpt, reading_minutes, slugify


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


class ContentSync:
    """Imports and exports the whole `content/` tree."""

    def __init__(self, db: Session, root: Path) -> None:
        self.db = db
        self.paths = ContentPaths(root)

    # -- import ------------------------------------------------------------

    def import_all(self, *, prune: bool = False, dry_run: bool = False) -> SyncReport:
        report = SyncReport()
        if not self.paths.root.is_dir():
            raise ContentError(f"No content directory at {self.paths.root}")

        self._import_settings(report)
        self._import_blog_categories(report, prune=prune)
        self._import_blog_posts(report, prune=prune)
        self._import_team(report, prune=prune)
        self._import_alumni(report, prune=prune)
        self._import_collaborations(report, prune=prune)
        self._import_events(report, prune=prune)
        self._import_ieee_day(report, prune=prune)

        if dry_run:
            self.db.rollback()
        else:
            self.db.commit()
        return report

    def _import_settings(self, report: SyncReport) -> None:
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
            slug = slugify(item.slug or item.name, max_length=120)
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
            # the URL and nothing else has to be kept in step.
            slug = slugify(item.slug or path.stem, max_length=220)
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
                "excerpt": item.excerpt or build_excerpt(body),
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
            slug = slugify(item.slug or item.name, max_length=160)
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
            slug = slugify(item.slug or item.name, max_length=160)
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
            slug = slugify(item.slug or item.name, max_length=160)
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
            slug = slugify(item.slug or item.title, max_length=220)
            if slug in seen:
                # Several events share a title across years (Slash, Xgrid),
                # so disambiguate with the year rather than silently
                # overwriting the earlier one.
                suffix = item.date.year if item.date else index
                slug = f"{slug}-{suffix}"
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
        """Write the database out to `content/`."""
        report = SyncReport()
        self.paths.root.mkdir(parents=True, exist_ok=True)

        self._export_settings(report)
        self._export_blog_categories(report)
        self._export_blog_posts(report)
        self._export_team(report)
        self._export_alumni(report)
        self._export_collaborations(report)
        self._export_events(report)
        self._export_ieee_day(report)
        return report

    def _export_settings(self, report: SyncReport) -> None:
        values = {
            row.key: row.value
            for row in self.db.scalars(select(SiteSetting).order_by(SiteSetting.key))
        }
        write_yaml(
            self.paths.site,
            values,
            header=(
                "Editable site copy and links.\n"
                "Also editable in the admin dashboard under Settings."
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
            header="Blog categories. List order is display order.",
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
                    "tags": [tag.name for tag in post.tags],
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
            header=(
                "Team roster. List order is display order within each category.\n"
                "Categories: faculty, core, executive, mentor.\n"
                "Run `just content-import` after editing."
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
            header="Alumni. Only publicly shareable details belong here.",
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
            header="Industry collaborations. List order is display order.",
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
            header="Events, newest first. Dates are YYYY-MM-DD.",
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
            header="IEEE Day editions, newest first.",
        )
        for _ in editions:
            report.record("ieee day", "updated")


def _compact(data: dict[str, Any]) -> dict[str, Any]:
    """Drop keys with no value, so exported files stay readable."""
    return {k: v for k, v in data.items() if v not in (None, "", [], {})}
