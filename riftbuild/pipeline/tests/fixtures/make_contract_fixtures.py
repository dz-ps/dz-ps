"""Generates contracts/fixtures/* — SYNTHETIC entities only (fx_*), never real game data (DECISIONS.md D14).

Run: uv run python tests/fixtures/make_contract_fixtures.py
"""

import copy
import json
from pathlib import Path

from riftbuild_pipeline.models import CatalogBundle, Manifest, MetaBundle

ROOT = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"
P = {"patch": "9.9z", "source_url": "https://example.invalid/fixture", "collected_at": "2026-01-01T00:00:00Z"}


def ability(key, name, desc, dmg=(), cc=()):
    return {
        "key": key,
        "name_en": name,
        "name_pt": None,
        "description_en": desc,
        "description_pt": None,
        "damage_types": list(dmg),
        "cc_types": list(cc),
        "icon": f"fx_{name.lower().replace(' ', '_')}.webp",
    }


def champion(cid, name, roles, classes, profile, tags, abilities, stats=True):
    return {
        **P,
        "id": cid,
        "name_en": name,
        "name_pt": name,
        "roles": roles,
        "classes": classes,
        "damage_profile": {**profile, "method": "heuristic_v1"},
        "tags": [{"tag": t, "ability_key": k, "phrase": "fixture"} for t, k in tags],
        "abilities": abilities,
        "base_stats": {
            "hp": 600,
            "hp_per_level": 100,
            "ad": 55,
            "ad_per_level": 3,
            "armor": 30,
            "armor_per_level": 4,
            "mr": 32,
            "mr_per_level": 1.5,
            "attack_speed": 0.7,
            "attack_speed_per_level": 2,
            "move_speed": 340,
        }
        if stats
        else None,
        "icon": f"{cid}.webp",
    }


def item(iid, name, category, cost, stats=None, tags=(), unique_groups=(), passives=(), recipe=(), tier=3, **kw):
    return {
        **P,
        "id": iid,
        "name_en": name,
        "name_pt": None,
        "category": category,
        "source_category": "fixture",
        "tier": tier,
        "cost": cost,
        "recipe": list(recipe),
        "stats": stats or {},
        "tags": list(tags),
        "unique_groups": list(unique_groups),
        "passives": list(passives),
        "icon": f"{iid}.webp",
        **kw,
    }


def rune(rid, kind, path=None, slot=None):
    return {
        **P,
        "id": rid,
        "name_en": rid,
        "name_pt": None,
        "kind": kind,
        "path": path,
        "slot": slot,
        "description": "fixture",
        "icon": f"{rid}.webp",
    }


def spell(sid, jungle_only=False, selectable=True):
    return {
        **P,
        "id": sid,
        "name_en": sid,
        "name_pt": None,
        "cooldown": 100,
        "description": "fixture",
        "icon": f"{sid}.webp",
        "jungle_only": jungle_only,
        "selectable": selectable,
    }


def unique(name):
    return {"name": name, "kind": "passive", "unique": True, "description": "fixture"}


catalog = {
    "patch": "9.9z",
    "fixture": True,
    "generated_by": "fixture",
    "sources": [],
    "champions": [
        champion(
            "fx_healer",
            "Fx Healer",
            ["support"],
            ["support"],
            {"physical": 0.2, "magic": 0.8, "true": 0},
            [("heal", "W"), ("soft_cc", "Q")],
            [
                ability("P", "Fx Heal Passive", "Heals allies."),
                ability("Q", "Fx Bolt", "Slows.", ["magic"], ["slow"]),
                ability("W", "Fx Heal", "Heals an ally."),
                ability("E", "Fx Silence", "Silences.", ["magic"], ["silence"]),
                ability("R", "Fx Wish", "Heals all allies."),
            ],
        ),
        champion(
            "fx_tank",
            "Fx Tank",
            ["jungle"],
            ["tank"],
            {"physical": 0.3, "magic": 0.7, "true": 0},
            [("hard_cc", "Q"), ("engage", "Q"), ("tank", None), ("dash", "Q")],
            [
                ability("P", "Fx Curse", "Curses."),
                ability("Q", "Fx Pull", "Stuns and pulls.", ["magic"], ["stun"]),
                ability("W", "Fx Aura", "Damages nearby.", ["magic"]),
                ability("E", "Fx Spin", "Slows.", ["magic"], ["slow"]),
                ability("R", "Fx Big Stun", "Stuns all nearby.", ["magic"], ["stun"]),
            ],
        ),
        champion(
            "fx_marksman",
            "Fx Marksman",
            ["dragon"],
            ["marksman"],
            {"physical": 0.85, "magic": 0.15, "true": 0},
            [("hard_cc", "E"), ("scaling", "P")],
            [
                ability("P", "Fx Rush", "Gains speed."),
                ability("Q", "Fx Swap", "Swaps weapons.", ["physical"]),
                ability("W", "Fx Zap", "Slows.", ["physical"], ["slow"]),
                ability("E", "Fx Traps", "Roots.", ["magic"], ["root"]),
                ability("R", "Fx Rocket", "Global rocket.", ["physical"]),
            ],
        ),
    ],
    "items": [
        item("fx_boots_a", "Fx Boots A", "boots", 900, {"move_speed": 45, "armor": 25}, ["armor"], tier=2),
        item(
            "fx_boots_b",
            "Fx Boots B",
            "boots",
            1000,
            {"move_speed": 45, "mr": 25, "tenacity": 30},
            ["magic_resist", "tenacity"],
            tier=2,
        ),
        item(
            "fx_item_spellblade_1",
            "Fx Spellblade One",
            "magic",
            3000,
            {"ap": 80},
            ["ability_power", "spellblade"],
            ["spellblade"],
            [unique("Spellblade")],
        ),
        item(
            "fx_item_spellblade_2",
            "Fx Spellblade Two",
            "physical",
            3000,
            {"ad": 40},
            ["attack_damage", "spellblade"],
            ["spellblade"],
            [unique("Spellblade")],
        ),
        item(
            "fx_anti_heal_ap",
            "Fx Anti Heal AP",
            "magic",
            2500,
            {"ap": 60},
            ["ability_power", "anti_heal"],
            ["grievous_wounds"],
            [unique("Grievous Wounds")],
        ),
        item("fx_mr_item", "Fx MR Item", "defense", 2800, {"mr": 60, "hp": 300}, ["magic_resist", "health"]),
        item("fx_component", "Fx Component", "component", 400, {"ap": 20}, ["ability_power"], tier=1),
        item(
            "fx_limited", "Fx Limited", "defense", 2000, {"hp": 200}, ["health"], limit=1, limit_group="fx_group"
        ),
    ],
    "runes": [rune("fx_keystone_a", "keystone"), rune("fx_keystone_b", "keystone")]
    + [
        rune(f"fx_{p}_{s}_{n}", "minor", p, s)
        for p in ("domination", "resolve")
        for s in (1, 2, 3)
        for n in ("a", "b")
    ],
    "summoner_spells": [
        spell("smite", True),
        spell("flash"),
        spell("ignite"),
        spell("chilling_smite", True, False),
    ],
    "patches": [
        {
            "version": "9.9z",
            "date": "2026-01-01",
            "notes_url": None,
            "changes": [{"entity_kind": "champion", "entity_id": "fx_tank", "change": "buff"}],
            "source_url": P["source_url"],
            "collected_at": P["collected_at"],
        }
    ],
    "rules": {"item_slots": 6, "rune_page": {}, "max_level": 15, "stat_growth": "linear_estimate"},
    "aliases": {"fxh": "fx_healer"},
}
meta = {
    "patch": "9.9z",
    "fixture": True,
    "rank_tiers": ["Fx Tier"],
    "stats": [
        {
            "champion_id": "fx_tank",
            "role": "jungle",
            "rank_tier": "Fx Tier",
            "patch": "9.9z",
            "win_rate": 51.5,
            "pick_rate": 5.0,
            "ban_rate": 10.0,
            "source_url": P["source_url"],
            "collected_at": P["collected_at"],
        }
    ],
    "builds": [
        {
            "champion_id": "fx_tank",
            "role": "jungle",
            "core_items": ["fx_mr_item"],
            "patch": "9.9z",
            "source_url": P["source_url"],
            "collected_at": P["collected_at"],
        }
    ],
    "source_url": P["source_url"],
    "source_name": "fixture",
    "source_note": "fixture",
    "collected_at": P["collected_at"],
}
manifest = {
    "game_patch": {"version": "9.9z", "source_url": P["source_url"], "detected_at": P["collected_at"]},
    "catalog": {
        "patch": "9.9z",
        "hash": "sha256:" + "0" * 64,
        "path": "catalog/9.9z/x.json.gz",
        "bytes": 1,
        "published_at": P["collected_at"],
    },
    "meta": None,
    "icons_base": "icons/",
    "verified_at": P["collected_at"],
}

valid = {
    "catalog.fixture.json": CatalogBundle.model_validate(catalog).model_dump(mode="json"),
    "meta.fixture.json": MetaBundle.model_validate(meta).model_dump(mode="json"),
    "manifest.fixture.json": Manifest.model_validate(manifest).model_dump(mode="json"),
}


def mutate(base, fn):
    data = copy.deepcopy(base)
    fn(data)
    return data


invalid = {
    "catalog-extra-field.fixture.json": mutate(valid["catalog.fixture.json"], lambda d: d.update(unexpected=True)),
    "catalog-bad-slug.fixture.json": mutate(
        valid["catalog.fixture.json"], lambda d: d["champions"][0].update(id="Fx Healer")
    ),
    "catalog-pc-game.fixture.json": mutate(
        valid["catalog.fixture.json"], lambda d: d["items"][0].update(game="lol")
    ),
    "catalog-bad-category.fixture.json": mutate(
        valid["catalog.fixture.json"], lambda d: d["items"][0].update(category="mythic")
    ),
    "catalog-missing-source.fixture.json": mutate(
        valid["catalog.fixture.json"], lambda d: d["runes"][0].pop("source_url")
    ),
    "catalog-http-source.fixture.json": mutate(
        valid["catalog.fixture.json"], lambda d: d["runes"][0].update(source_url="http://x")
    ),
    "meta-winrate-out-of-range.fixture.json": mutate(
        valid["meta.fixture.json"], lambda d: d["stats"][0].update(win_rate=150)
    ),
    "manifest-bad-hash.fixture.json": mutate(
        valid["manifest.fixture.json"], lambda d: d["catalog"].update(hash="md5:abc")
    ),
}

for folder, docs in (("valid", valid), ("invalid", invalid)):
    (ROOT / folder).mkdir(parents=True, exist_ok=True)
    for name, doc in docs.items():
        (ROOT / folder / name).write_text(json.dumps(doc, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
print(f"wrote {len(valid)} valid and {len(invalid)} invalid fixtures to {ROOT}")
