"""`ieee-content` - the scriptable way to update the site.

    just content-import      load content/ into the database
    just content-export      write the database back out to content/
    just content-check       show what an import would change
    just content-validate    check the files without touching the database

Run with --help for the full set of flags.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from app.content.store import ContentError
from app.content.sync import ContentSync, SyncReport
from app.core.config import settings
from app.db.session import SessionLocal


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ieee-content",
        description="Import and export the version-controlled site content.",
    )
    parser.add_argument(
        "--content-dir",
        type=Path,
        default=settings.content_dir,
        help="Content directory (default: %(default)s)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    importer = subparsers.add_parser("import", help="Load content/ into the database")
    importer.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing anything",
    )
    importer.add_argument(
        "--prune",
        action="store_true",
        help=(
            "Also delete database rows that no longer appear in content/. "
            "Off by default so an import never removes content added in the dashboard."
        ),
    )

    subparsers.add_parser("export", help="Write the database out to content/")
    subparsers.add_parser("validate", help="Validate content/ without using the database")
    return parser


def _print_report(report: SyncReport, *, title: str) -> None:
    print(title)
    lines = report.lines()
    if lines:
        print("\n".join(lines))
    else:
        print("  nothing to do")
    for warning in report.warnings:
        print(f"  warning: {warning}", file=sys.stderr)


def _validate_only(content_dir: Path) -> int:
    """Parse and validate every content file, touching no database.

    Runs in a transaction that is always rolled back, which lets the same
    validation code path be reused without a schema or connection dependency
    on the importer's behaviour.
    """
    with SessionLocal() as db:
        sync = ContentSync(db, content_dir)
        try:
            report = sync.import_all(dry_run=True)
        except (ContentError, ValidationError) as exc:
            print(f"Content is not valid:\n  {exc}", file=sys.stderr)
            return 1
    _print_report(report, title=f"content/ is valid ({content_dir})")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    content_dir: Path = args.content_dir

    if args.command == "validate":
        return _validate_only(content_dir)

    with SessionLocal() as db:
        sync = ContentSync(db, content_dir)
        try:
            if args.command == "import":
                report = sync.import_all(prune=args.prune, dry_run=args.dry_run)
                mode = "would change" if args.dry_run else "imported"
                _print_report(report, title=f"content/ {mode}:")
                if args.dry_run and report.total_changes == 0:
                    print("Database already matches content/.")
            else:
                report = sync.export_all()
                _print_report(report, title=f"exported database to {content_dir}:")
        except ContentError as exc:
            print(f"Content error:\n  {exc}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
