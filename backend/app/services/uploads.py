"""Admin image uploads.

File uploads are the most abusable admin surface, so a file is accepted only
if all of the following hold: the declared type is on the allow-list, the
bytes are within the size limit, and Pillow can actually decode the image.
Verifying the content is what stops a renamed script or a malformed file from
being stored and later served.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.errors import ValidationError

# Raster formats a browser can display, plus SVG's deliberate absence: SVG is
# an executable document and would reintroduce XSS through an image tag.
ALLOWED_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
}
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

# Guards against decompression-bomb images that are small on disk.
MAX_PIXELS = 50_000_000


@dataclass(frozen=True)
class StoredImage:
    """Where a saved upload lives, and how the site should reference it."""

    url: str
    path: Path
    width: int
    height: int
    size_bytes: int


def upload_root() -> Path:
    root = settings.upload_dir
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_image(*, content: bytes, content_type: str | None, filename: str | None) -> StoredImage:
    """Validate and store an uploaded image, returning its public URL."""
    if not content:
        raise ValidationError("The uploaded file is empty.")

    if len(content) > settings.max_upload_size_bytes:
        raise ValidationError(f"Images must be {settings.max_upload_size_mb} MB or smaller.")

    if content_type and content_type.split(";")[0].strip() not in ALLOWED_CONTENT_TYPES:
        raise ValidationError("Only JPEG, PNG, WebP and GIF images are accepted.")

    try:
        with Image.open(BytesIO(content)) as image:
            image_format = (image.format or "").upper()
            width, height = image.size
            # verify() is what proves the bytes really are the image they
            # claim to be; it consumes the file object, hence the reopen below.
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValidationError("That file is not a readable image.") from exc

    if image_format not in ALLOWED_FORMATS:
        raise ValidationError("Only JPEG, PNG, WebP and GIF images are accepted.")

    if width * height > MAX_PIXELS:
        raise ValidationError("That image's dimensions are too large.")

    # The stored name is generated, never taken from the client, so a crafted
    # filename cannot traverse directories or overwrite an existing file.
    extension = ALLOWED_FORMATS[image_format]
    folder = date.today().strftime("%Y/%m")
    stem = f"{_slug_hint(filename)}-{secrets.token_hex(8)}" if filename else secrets.token_hex(12)
    relative = Path(folder) / f"{stem}{extension}"

    destination = upload_root() / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    return StoredImage(
        url=f"/uploads/{relative.as_posix()}",
        path=destination,
        width=width,
        height=height,
        size_bytes=len(content),
    )


def _slug_hint(filename: str) -> str:
    """A short, sanitised hint from the original name, for recognisability."""
    from app.services.text import slugify

    stem = Path(filename).stem
    return slugify(stem, max_length=40) or "image"


def delete_image(url: str) -> bool:
    """Remove a previously stored upload. Returns whether a file was deleted.

    Only paths under the upload directory are touched, so a crafted URL cannot
    delete anything else.
    """
    prefix = "/uploads/"
    if not url.startswith(prefix):
        return False

    root = upload_root().resolve()
    target = (root / url[len(prefix) :]).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        return False

    target.unlink()
    return True
