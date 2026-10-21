"""Contract tests: pydantic accepts/rejects the same fixtures as zod (packages/shared/src/schemas)."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from riftbuild_pipeline.models import CatalogBundle, Manifest, MetaBundle

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"


def model_for(doc: dict):
    if doc.get("kind") == "catalog":
        return CatalogBundle
    if doc.get("kind") == "meta":
        return MetaBundle
    return Manifest


@pytest.mark.parametrize("path", sorted((CONTRACTS / "fixtures" / "valid").glob("*.json")), ids=lambda p: p.name)
def test_valid_fixtures(path: Path) -> None:
    doc = json.loads(path.read_text())
    assert doc.get("fixture", True) is True or "game_patch" in doc
    model_for(doc).model_validate(doc)


@pytest.mark.parametrize("path", sorted((CONTRACTS / "fixtures" / "invalid").glob("*.json")), ids=lambda p: p.name)
def test_invalid_fixtures(path: Path) -> None:
    doc = json.loads(path.read_text())
    model = (
        CatalogBundle
        if path.name.startswith("catalog")
        else MetaBundle
        if path.name.startswith("meta")
        else Manifest
    )
    with pytest.raises(ValidationError):
        model.model_validate(doc)


@pytest.mark.parametrize(
    ("name", "model"),
    [("catalog-bundle", CatalogBundle), ("meta-bundle", MetaBundle), ("manifest", Manifest)],
)
def test_exported_schema_is_up_to_date(name: str, model) -> None:
    committed = json.loads((CONTRACTS / "schema" / f"{name}.schema.json").read_text())
    assert committed == model.model_json_schema(mode="serialization"), (
        "contracts/schema is stale: run `uv run riftbuild export-schema`"
    )
