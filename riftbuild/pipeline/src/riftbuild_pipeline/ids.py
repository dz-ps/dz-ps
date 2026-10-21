"""Stable entity IDs: snake_case slug of name_en (mirrors packages/shared/src/ids.ts)."""

import re
import unicodedata

_SLUG = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    text = re.sub(r"['’.]", "", text)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def is_slug(value: str) -> bool:
    return bool(_SLUG.match(value))
