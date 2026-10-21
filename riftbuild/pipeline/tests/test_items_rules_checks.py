import json
from pathlib import Path

from riftbuild_pipeline.bundle import carry_forward_collected_at, encode_bundle
from riftbuild_pipeline.models import CatalogBundle, RunePageRule
from riftbuild_pipeline.normalize.items import build_items
from riftbuild_pipeline.normalize.misc import build_rune_rule, build_spells
from riftbuild_pipeline.rules import build_rules, load_confirmed
from riftbuild_pipeline.sources.riftpatchnotes import RpnSpell
from riftbuild_pipeline.validate.checks import check_catalog

FIXTURE = Path(__file__).resolve().parents[2] / "contracts/fixtures/valid/catalog.fixture.json"
SRC = ("7.3b", "https://www.riftpatchnotes.com/items", "2026-10-21T00:00:00Z")


def payload() -> dict:
    return {
        "game": "wr",
        "removedSlugs": ["old-item"],
        "latestPatch": {"version": "7.3b", "items": {"fx-staff": "buff"}},
        "items": [
            {"name": "Fx Tome", "slug": "fx-tome", "category": "Components"},
            {"name": "Fx Staff", "slug": "fx-staff", "category": "Full Items"},
            {"name": "Fx Seraph", "slug": "fx-seraph", "category": "Full Items"},
            {"name": "Fx Ward", "slug": "fx-ward", "category": "Components"},
            {"name": "Old Item", "slug": "old-item", "category": "Full Items"},
        ],
        "itemStats": {
            "fx-tome": {"cost": 400, "stats": {"Ability Power": 20}},
            "fx-staff": {
                "cost": 3000,
                "stats": {"Ability Power": "60", "Magic Penetration": 7},
                "recipe": [{"name": "Fx Tome", "slug": "fx-tome"}],
                "passives": [
                    {
                        "name": "Awe",
                        "type": "passive",
                        "unique": True,
                        "description": "Transforms into Fx Seraph at +700 mana.",
                    },
                    {
                        "name": "Rot",
                        "type": "passive",
                        "unique": True,
                        "description": "Inflicts 40% Grievous Wounds.",
                    },
                ],
                "tags": ["Magical"],
            },
            "fx-seraph": {"stats": {"Ability Power": 80}, "recipe": [{"name": "Fx Staff", "slug": "fx-staff"}]},
            "fx-ward": {"passives": [{"type": "active", "description": "Place a ward."}]},
            "old-item": {"cost": 1},
        },
    }


def test_items_normalization() -> None:
    result = build_items(payload(), *SRC)
    by_id = {i.id: i for i in result.items}
    assert set(by_id) == {"fx_tome", "fx_staff", "fx_seraph"}, "removed and consumable items are dropped"
    staff = by_id["fx_staff"]
    assert staff.category == "magic" and staff.tier == 2 and staff.cost == 3000
    assert staff.stats == {"ap": 60.0, "magic_pen": 7.0}
    assert {"anti_heal", "magic_pen", "ability_power"} <= set(staff.tags)
    assert staff.unique_groups == ["awe", "rot"]
    assert staff.last_change == "buff"
    seraph = by_id["fx_seraph"]
    assert not seraph.purchasable and seraph.transforms_from == "fx_staff" and seraph.cost is None


def test_spells_jungle_and_transforms() -> None:
    spells = build_spells(
        [
            RpnSpell(
                "smite",
                "Smite",
                10,
                "Deal true damage to a monster. Transforms into Chilling Smite after 3 uses.",
                "u",
            ),
            RpnSpell("chilling-smite", "Chilling Smite", 15, "Deal damage to monsters or champions.", "u"),
            RpnSpell("flash", "Flash", 150, "Blink a short distance.", "u"),
        ],
        *SRC,
    )
    by_id = {s.id: s for s in spells}
    assert by_id["smite"].jungle_only and by_id["smite"].selectable
    assert by_id["chilling_smite"].jungle_only and not by_id["chilling_smite"].selectable
    assert not by_id["flash"].jungle_only


def test_rune_rule_must_match_confirmed() -> None:
    text = (
        "A loadout takes one keystone, one rune from each of the three slots of a primary path, "
        "and one rune from any slot of a different path."
    )
    ok = build_rules(build_rune_rule(text), load_confirmed())
    assert not ok.blocking
    changed = build_rules(RunePageRule(keystone_tied_to_primary_path=True), load_confirmed())
    assert changed.blocking and "rune page rule changed" in changed.blocking[0]
    assert build_rules(None, load_confirmed()).blocking


def load_fixture() -> CatalogBundle:
    return CatalogBundle.model_validate(json.loads(FIXTURE.read_text()))


def test_fixture_bundles_never_pass_the_gate() -> None:
    report = check_catalog(load_fixture())
    assert any("fixture" in b for b in report.blocking)


def test_gate_blocks_missing_icons_costs_drops_and_renames() -> None:
    previous = load_fixture()
    bundle = load_fixture()
    bundle.fixture = False
    bundle.items[0].icon = None
    bundle.items[1].cost = None
    bundle.champions = bundle.champions[:1]
    bundle.runes[0].name_en = "Renamed"
    blocking = "\n".join(check_catalog(bundle, previous).blocking)
    assert "items without icon" in blocking
    assert "has no cost" in blocking
    assert "champions count dropped" in blocking
    assert "changed name" in blocking


def test_gate_blocks_pc_sources() -> None:
    bundle = load_fixture()
    bundle.fixture = False
    bundle.items[0].source_url = "https://ddragon.leagueoflegends.com/cdn/x.json"
    assert any("forbidden" in b for b in check_catalog(bundle).blocking)


def test_bundle_hash_is_stable_and_collected_at_carries_forward() -> None:
    a = load_fixture()
    assert encode_bundle(a)[2] == encode_bundle(load_fixture())[2]
    prev = [{"id": "x", "v": 1, "collected_at": "2026-01-01T00:00:00Z"}]
    same = carry_forward_collected_at([{"id": "x", "v": 1, "collected_at": "2026-02-02T00:00:00Z"}], prev)
    changed = carry_forward_collected_at([{"id": "x", "v": 2, "collected_at": "2026-02-02T00:00:00Z"}], prev)
    assert same[0]["collected_at"] == "2026-01-01T00:00:00Z"
    assert changed[0]["collected_at"] == "2026-02-02T00:00:00Z"
