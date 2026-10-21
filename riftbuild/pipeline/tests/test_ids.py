import json
from pathlib import Path

import pytest

from riftbuild_pipeline.ids import is_slug, slugify

CASES = json.loads((Path(__file__).parents[2] / "contracts/cases/slugify.json").read_text())["cases"]


@pytest.mark.parametrize(("name", "expected"), CASES)
def test_slugify_contract(name: str, expected: str) -> None:
    assert slugify(name) == expected
    assert is_slug(expected)
