"""Rules bundle: derived values checked against data/confirmed_rules.yaml (DECISIONS.md D12)."""

from dataclasses import dataclass
from pathlib import Path

import yaml

from .config import DATA_DIR
from .models import RuleFlag, Rules, RunePageRule


@dataclass
class RulesResult:
    rules: Rules
    blocking: list[str]
    warnings: list[str]


def load_confirmed(path: Path = DATA_DIR / "confirmed_rules.yaml") -> dict:
    return yaml.safe_load(path.read_text())


def build_rules(derived_rune_page: RunePageRule | None, confirmed: dict | None = None) -> RulesResult:
    confirmed = confirmed or load_confirmed()
    blocking: list[str] = []
    warnings: list[str] = []

    rune_conf = confirmed["rune_page"]
    rune_page = RunePageRule(**rune_conf["value"])
    if derived_rune_page is None:
        blocking.append("rune page rule could not be derived from the source this run (structure changed?)")
    else:
        derived = derived_rune_page.model_dump(exclude={"source_text"})
        expected = rune_page.model_dump(exclude={"source_text"})
        if derived != expected:
            blocking.append(f"rune page rule changed: derived {derived} != confirmed {expected}")
        rune_page = derived_rune_page

    flags = {}
    for key in (
        "rune_page",
        "boots_max",
        "jungle_requires_spell",
        "unique_passives_do_not_stack",
        "item_slots",
        "max_level",
        "stat_growth",
    ):
        entry = confirmed[key]
        flags[key] = RuleFlag(confirmed=bool(entry.get("confirmed")), note=entry.get("note"))
        if not entry.get("confirmed"):
            warnings.append(f"rule {key} is not confirmed: {entry.get('note')}")

    rules = Rules(
        item_slots=int(confirmed["item_slots"]["value"]),
        boots_max=int(confirmed["boots_max"]["value"]),
        unique_passives_do_not_stack=bool(confirmed["unique_passives_do_not_stack"]["value"]),
        jungle_requires_spell=confirmed["jungle_requires_spell"]["value"],
        rune_page=rune_page,
        max_level=int(confirmed["max_level"]["value"]),
        stat_growth=confirmed["stat_growth"]["value"],
        flags=flags,
    )
    return RulesResult(rules=rules, blocking=blocking, warnings=warnings)
