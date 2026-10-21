"""Item normalization from the Rift Patch Notes items payload (Wild Rift only; removed items skipped)."""

import re
from dataclasses import dataclass

from ..ids import slugify
from ..models import Item, ItemEffect
from ..sources.riftpatchnotes import asset_url

STAT_MAP = {
    "Ability Haste": "ability_haste",
    "Ability Power": "ap",
    "Armor": "armor",
    "Armor Penetration": "armor_pen",
    "armpenflat": "armor_pen",
    "Armor Penetration percentage": "armor_pen_pct",
    "Attack Damage": "ad",
    "Attack Speed": "attack_speed",
    "Base Mana Regen": "mana_regen",
    "Critical Rate": "crit",
    "Critical Strike Chance": "crit",
    "Heal & Shield Power": "heal_shield_power",
    "Heal and Shield Power": "heal_shield_power",
    "Health": "hp",
    "Max Health": "hp",
    "Health Regen": "hp_regen",
    "Life Steal": "lifesteal",
    "Magic Penetration": "magic_pen",
    "Magic Penetration Rate": "magic_pen_pct",
    "Magic Resist": "mr",
    "Mana": "mana",
    "Max Mana": "mana",
    "Mana Regen": "mana_regen",
    "Movement Speed": "move_speed",
    "Omnivamp": "omnivamp",
    "Tenacity": "tenacity",
}

SOURCE_TAG_TO_CATEGORY = {
    "Physical": "physical",
    "Magical": "magic",
    "Defense": "defense",
    "Support": "support",
}

STAT_TAGS = {
    "armor": "armor",
    "mr": "magic_resist",
    "hp": "health",
    "ap": "ability_power",
    "ad": "attack_damage",
    "attack_speed": "attack_speed",
    "crit": "crit",
    "ability_haste": "ability_haste",
    "tenacity": "tenacity",
    "lifesteal": "lifesteal",
    "omnivamp": "omnivamp",
    "armor_pen": "armor_pen",
    "armor_pen_pct": "armor_pen",
    "magic_pen": "magic_pen",
    "magic_pen_pct": "magic_pen",
    "heal_shield_power": "heal_shield_power",
}

TEXT_TAGS: list[tuple[str, re.Pattern[str]]] = [
    ("anti_heal", re.compile(r"grievous wounds", re.I)),
    ("tenacity", re.compile(r"\btenacity\b", re.I)),
    ("spell_shield", re.compile(r"spell ?shield|blocks? the next (enemy )?ability", re.I)),
    ("stasis", re.compile(r"\bstasis\b", re.I)),
    ("armor_pen", re.compile(r"armor penetration", re.I)),
    ("magic_pen", re.compile(r"magic penetration", re.I)),
    ("on_hit", re.compile(r"\bon-hit\b", re.I)),
    ("lifesteal", re.compile(r"life ?steal", re.I)),
    ("omnivamp", re.compile(r"omnivamp", re.I)),
    ("shield", re.compile(r"(?<!spell )\bshield(s|ed|ing)?\b", re.I)),
]

_LIMIT = re.compile(r"limited to (\d+) ([a-z' ]+?) items?", re.I)
# "Transforms into Seraph's Embrace at +700 mana." / "...to upgrade to Black Mist Scythe." / "upgrades into X"
_TRANSFORM = re.compile(r"(?i:transforms into|upgrades? (?:in)?to) ([A-Z][\w' ]+?)(?: at\b|\.|,|$)")


@dataclass
class ItemsResult:
    items: list[Item]
    warnings: list[str]
    slug_to_id: dict[str, str]
    name_to_id: dict[str, str]


def _number(value: object) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        match = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*%?\s*", value)
        return float(match.group(1)) if match else None
    return None


def build_items(payload: dict, patch: str, source_url: str, collected_at: str) -> ItemsResult:
    warnings: list[str] = []
    removed = set(payload.get("removedSlugs") or [])
    stats_by_slug: dict = payload.get("itemStats") or {}
    latest = payload.get("latestPatch") or {}
    changed = latest.get("items") or {}
    latest_version = latest.get("version")

    listed = [entry for entry in payload.get("items", []) if entry.get("slug") not in removed]
    slug_to_id = {entry["slug"]: slugify(entry["name"]) for entry in listed}
    name_to_id = {entry["name"]: slugify(entry["name"]) for entry in listed}

    draft: dict[str, dict] = {}
    for entry in listed:
        slug, name, source_category = entry["slug"], entry["name"], entry.get("category") or ""
        data = stats_by_slug.get(slug)
        item_id = slug_to_id[slug]
        if data is None:
            warnings.append(f"item {item_id}: no stats/cost in source (skipped)")
            continue
        raw_stats = data.get("stats") or {}
        stats: dict[str, float] = {}
        for label, value in raw_stats.items():
            key = STAT_MAP.get(label)
            number = _number(value)
            if key is None:
                warnings.append(f"item {item_id}: unknown stat label {label!r}")
            elif number is None:
                warnings.append(f"item {item_id}: non-numeric stat {label}={value!r}")
            else:
                stats[key] = stats.get(key, 0.0) + number
        passives, actives = [], []
        for effect in data.get("passives") or []:
            item_effect = ItemEffect(
                name=effect.get("name") or "",
                kind="active" if effect.get("type") == "active" else "passive",
                unique=bool(effect.get("unique")),
                description=(effect.get("description") or "").strip(),
                cooldown=str(effect["cooldown"]) if effect.get("cooldown") is not None else None,
            )
            (actives if item_effect.kind == "active" else passives).append(item_effect)
        recipe_ids = []
        for comp in data.get("recipe") or []:
            comp_id = slug_to_id.get(comp.get("slug")) or slugify(comp.get("name") or "")
            recipe_ids.append(comp_id)
        draft[item_id] = {
            "entry": entry,
            "name": name,
            "slug": slug,
            "source_category": source_category,
            "source_tags": data.get("tags") or [],
            "cost": data.get("cost"),
            "stats": stats,
            "raw_stats": {k: v for k, v in raw_stats.items() if isinstance(v, int | float | str)},
            "passives": passives,
            "actives": actives,
            "recipe": recipe_ids,
        }

    # Items reached by transforming/upgrading another item are not bought directly (no cost in the source).
    transforms_from: dict[str, str] = {}
    for item_id, d in draft.items():
        for effect in d["passives"] + d["actives"]:
            for match in _TRANSFORM.finditer(effect.description):
                target = name_to_id.get(match.group(1).strip())
                if target and target != item_id:
                    transforms_from.setdefault(target, item_id)
    for item_id in list(draft):
        d = draft[item_id]
        is_consumable = d["cost"] is None and not d["stats"] and bool(d["actives"])
        if is_consumable and item_id not in transforms_from:
            warnings.append(f"item {item_id}: consumable without cost in source (excluded from builds)")
            del draft[item_id]

    tiers: dict[str, int] = {}

    def tier_of(item_id: str, stack: tuple[str, ...] = ()) -> int:
        if item_id in tiers:
            return tiers[item_id]
        if item_id in stack or item_id not in draft:
            return 0
        recipe = draft[item_id]["recipe"]
        value = 1 + max((tier_of(r, (*stack, item_id)) for r in recipe), default=0)
        tiers[item_id] = min(value, 4)
        return tiers[item_id]

    items: list[Item] = []
    for item_id, d in draft.items():
        effects = d["passives"] + d["actives"]
        text = " ".join(e.description for e in effects)
        tags: list[str] = []
        for stat_key, tag in STAT_TAGS.items():
            if d["stats"].get(stat_key) and tag not in tags:
                tags.append(tag)
        for tag, pattern in TEXT_TAGS:
            if pattern.search(text) and tag not in tags:
                tags.append(tag)
        if any(e.name.lower() == "spellblade" for e in effects):
            tags.append("spellblade")
        if d["actives"]:
            tags.append("active")
        missing = [r for r in d["recipe"] if r not in draft]
        if missing:
            warnings.append(f"item {item_id}: recipe references unknown items {missing}")
        limit = limit_group = None
        limit_match = _LIMIT.search(text)
        if limit_match:
            limit = int(limit_match.group(1))
            limit_group = slugify(limit_match.group(2))
        source_category = d["source_category"]
        category = _category(source_category, d["source_tags"], d["stats"])
        if category is None:
            warnings.append(f"item {item_id}: could not map category {source_category!r} {d['source_tags']}")
            category = "component"
        items.append(
            Item(
                patch=patch,
                source_url=source_url,
                collected_at=collected_at,
                id=item_id,
                name_en=d["name"],
                name_pt=None,  # TODO: no confirmed pt-BR source for item names yet (spec §2: show English)
                category=category,
                source_category=source_category,
                tier=max(1, tier_of(item_id)),
                cost=int(d["cost"]) if isinstance(d["cost"], int | float) else None,
                recipe=[r for r in d["recipe"] if r in draft],
                stats=d["stats"],
                raw_stats=d["raw_stats"],
                passives=d["passives"],
                actives=d["actives"],
                tags=sorted(set(tags)),
                unique_groups=sorted({slugify(e.name) for e in effects if e.unique and e.name}),
                limit=limit,
                limit_group=limit_group,
                purchasable=item_id not in transforms_from,
                transforms_from=transforms_from.get(item_id),
                icon=asset_url(f"/items/{d['slug']}.png"),
                last_changed_patch=latest_version if d["slug"] in changed else None,
                last_change=_change_kind(changed.get(d["slug"])),
            )
        )
    items.sort(key=lambda i: i.id)
    return ItemsResult(items=items, warnings=warnings, slug_to_id=slug_to_id, name_to_id=name_to_id)


def _category(source_category: str, source_tags: list[str], stats: dict[str, float]) -> str | None:
    if source_category == "Boots":
        return "boots"
    if source_category in ("Components", "Mid-Tier"):
        return "component"
    if source_category == "Support":
        return "support"
    for tag in source_tags:
        if tag in SOURCE_TAG_TO_CATEGORY:
            return SOURCE_TAG_TO_CATEGORY[tag]
    if stats.get("ap"):
        return "magic"
    if stats.get("ad") or stats.get("crit") or stats.get("attack_speed"):
        return "physical"
    if stats.get("armor") or stats.get("mr") or stats.get("hp"):
        return "defense"
    return None


def _change_kind(value: object) -> str | None:
    return value if value in ("buff", "nerf", "change") else None
