"""Canonical JSON + sha256 bundles, with collected_at carried forward for unchanged content (D15)."""

import gzip
import hashlib
import json
from typing import Any

from pydantic import BaseModel


def canonical_json(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode_bundle(model: BaseModel) -> tuple[bytes, bytes, str]:
    """Return (json bytes, gzip bytes, "sha256:<hex>"). The hash covers the uncompressed canonical JSON."""
    raw = canonical_json(model.model_dump(mode="json"))
    gz = gzip.compress(raw, mtime=0)
    return raw, gz, f"sha256:{sha256_hex(raw)}"


def _content_key(entity: dict) -> bytes:
    return canonical_json({k: v for k, v in entity.items() if k != "collected_at"})


def carry_forward_collected_at(current: list[dict], previous: list[dict]) -> list[dict]:
    """Keep the previous collected_at when an entity's content did not change."""
    prev = {e["id"]: e for e in previous if "id" in e}
    out = []
    for entity in current:
        old = prev.get(entity.get("id"))
        if old is not None and _content_key(old) == _content_key(entity):
            entity = {**entity, "collected_at": old["collected_at"]}
        out.append(entity)
    return out
