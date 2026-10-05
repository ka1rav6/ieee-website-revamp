"""robots.txt and sitemap.xml.

Served from the application rather than a static file so that blog and event
URLs appear in the sitemap as soon as they are published.
"""

from __future__ import annotations

from datetime import date
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbSession
from app.models.content import BlogPost, IeeeDayEdition

router = APIRouter(include_in_schema=False)

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"

# Static routes, with how important and how volatile each one is.
STATIC_ROUTES: tuple[tuple[str, str, str], ...] = (
    ("/", "weekly", "1.0"),
    ("/about", "monthly", "0.7"),
    ("/team", "monthly", "0.8"),
    ("/events", "weekly", "0.8"),
    ("/blogs", "weekly", "0.9"),
    ("/collaborations", "monthly", "0.7"),
    ("/alumni", "monthly", "0.6"),
    ("/ieee-day", "monthly", "0.7"),
    ("/contact", "yearly", "0.6"),
)


@router.get("/robots.txt", response_class=Response)
def robots() -> Response:
    """Allow public crawling, keep the admin area and API out of indexes."""
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api/",
        "",
        f"Sitemap: {settings.site_url}/sitemap.xml",
        "",
    ]
    return Response("\n".join(lines), media_type="text/plain")


@router.get("/sitemap.xml", response_class=Response)
def sitemap(db: DbSession) -> Response:
    urlset = ET.Element("urlset", {"xmlns": SITEMAP_NS})

    def add(path: str, *, changefreq: str, priority: str, lastmod: date | None = None) -> None:
        url = ET.SubElement(urlset, "url")
        ET.SubElement(url, "loc").text = f"{settings.site_url}{path}"
        if lastmod is not None:
            ET.SubElement(url, "lastmod").text = lastmod.isoformat()
        ET.SubElement(url, "changefreq").text = changefreq
        ET.SubElement(url, "priority").text = priority

    for path, changefreq, priority in STATIC_ROUTES:
        add(path, changefreq=changefreq, priority=priority)

    published = db.execute(
        select(BlogPost.slug, BlogPost.published_at, BlogPost.updated_at)
        .where(BlogPost.is_published.is_(True))
        .order_by(BlogPost.published_at.desc().nulls_last())
    ).all()
    for slug, published_at, updated_at in published:
        add(
            f"/blogs/{slug}",
            changefreq="yearly",
            priority="0.8",
            lastmod=published_at or updated_at.date(),
        )

    for year in db.scalars(select(IeeeDayEdition.year).order_by(IeeeDayEdition.year.desc())):
        add(f"/ieee-day/{year}", changefreq="yearly", priority="0.5")

    body = ET.tostring(urlset, encoding="utf-8", xml_declaration=True)
    return Response(body, media_type="application/xml")
