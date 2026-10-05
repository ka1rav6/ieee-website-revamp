"""Reading and writing the files under `content/`.

Blog posts are Markdown with YAML frontmatter; everything else is a YAML list
or mapping. Writing goes through here too, so `content-export` produces files
in exactly the shape `content-import` expects.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

FRONTMATTER_FENCE = "---"


class ContentError(Exception):
    """A content file is missing, malformed or fails validation."""


@dataclass(frozen=True)
class ContentPaths:
    """Where each kind of content lives, relative to the content root."""

    root: Path

    @property
    def site(self) -> Path:
        return self.root / "site.yaml"

    @property
    def team(self) -> Path:
        return self.root / "team.yaml"

    @property
    def alumni(self) -> Path:
        return self.root / "alumni.yaml"

    @property
    def collaborations(self) -> Path:
        return self.root / "collaborations.yaml"

    @property
    def events(self) -> Path:
        return self.root / "events.yaml"

    @property
    def ieee_day(self) -> Path:
        return self.root / "ieee-day.yaml"

    @property
    def blogs_dir(self) -> Path:
        return self.root / "blogs"

    @property
    def blog_categories(self) -> Path:
        return self.blogs_dir / "categories.yaml"

    def blog_posts(self) -> list[Path]:
        if not self.blogs_dir.is_dir():
            return []
        return sorted(p for p in self.blogs_dir.glob("*.md") if p.is_file())


def read_yaml(path: Path, *, default: Any = None) -> Any:
    """Load a YAML file, returning `default` when it does not exist."""
    if not path.is_file():
        return default
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ContentError(f"{path.name} is not valid YAML: {exc}") from exc
    return default if loaded is None else loaded


def read_yaml_list(path: Path) -> list[dict[str, Any]]:
    """Load a YAML file that must contain a list of mappings."""
    loaded = read_yaml(path, default=[])
    if not isinstance(loaded, list):
        raise ContentError(f"{path.name} must contain a list of entries.")
    for index, entry in enumerate(loaded, start=1):
        if not isinstance(entry, dict):
            raise ContentError(
                f"{path.name} entry {index} must be a mapping, got {type(entry).__name__}."
            )
    return loaded


def read_yaml_mapping(path: Path) -> dict[str, Any]:
    loaded = read_yaml(path, default={})
    if not isinstance(loaded, dict):
        raise ContentError(f"{path.name} must contain a mapping of key: value.")
    return loaded


def split_frontmatter(text: str, *, source: str) -> tuple[dict[str, Any], str]:
    """Split a Markdown file into its frontmatter mapping and its body."""
    if not text.startswith(FRONTMATTER_FENCE):
        raise ContentError(
            f"{source} must start with a '---' frontmatter block describing the post."
        )

    parts = text.split(FRONTMATTER_FENCE, 2)
    if len(parts) < 3:
        raise ContentError(f"{source} has an unterminated '---' frontmatter block.")

    try:
        meta = yaml.safe_load(parts[1])
    except yaml.YAMLError as exc:
        raise ContentError(f"{source} has invalid YAML frontmatter: {exc}") from exc

    if not isinstance(meta, dict):
        raise ContentError(f"{source} frontmatter must be a mapping of key: value.")

    return meta, parts[2].lstrip("\n")


def _represent_str(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
    """Write multi-line strings as readable block scalars."""
    style = "|" if "\n" in value else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style=style)


class _Dumper(yaml.SafeDumper):
    """Dumper that indents list items, which reads better in a diff."""

    def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:
        super().increase_indent(flow=flow, indentless=False)


_Dumper.add_representer(str, _represent_str)
_Dumper.add_representer(
    date, lambda d, v: d.represent_scalar("tag:yaml.org,2002:str", v.isoformat())
)


def dump_yaml(data: Any) -> str:
    return yaml.dump(
        data,
        Dumper=_Dumper,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
        width=100,
    )


def write_yaml(path: Path, data: Any, *, header: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = dump_yaml(data)
    if header:
        commented = "\n".join(f"# {line}".rstrip() for line in header.strip().split("\n"))
        body = f"{commented}\n\n{body}"
    path.write_text(body, encoding="utf-8")


def write_markdown(path: Path, meta: dict[str, Any], body: str) -> None:
    """Write a post as frontmatter plus Markdown body."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # Drop empty optional fields so exported files stay readable.
    trimmed = {k: v for k, v in meta.items() if v not in (None, "", [], {})}
    content = f"{FRONTMATTER_FENCE}\n{dump_yaml(trimmed)}{FRONTMATTER_FENCE}\n\n{body.strip()}\n"
    path.write_text(content, encoding="utf-8")
