"""Champion normalization: official site (names en/pt, classes, abilities, icons) + Rift Patch Notes
(base stats, detailed ability text, lane roles)."""

from dataclasses import dataclass, field

from ..ids import slugify
from ..models import Ability, BaseStats, Champion, DamageProfile, TagEvidence
from ..sources.official import OfficialChampionPage
from ..sources.riftpatchnotes import RpnChampion
from . import text_rules
from .names import restore_casing, title_case_en

OFFICIAL_SLOT_TO_KEY = {"PASSIVE": "P", "1": "Q", "2": "W", "3": "E", "ULTIMATE": "R"}
RPN_SLOT_TO_KEY = {"Passive": "P", "Ability 1": "Q", "Ability 2": "W", "Ability 3": "E", "Ability 4": "R"}
LANE_TO_ROLE = {
    "Top": "baron",
    "Jungle": "jungle",
    "Mid": "mid",
    "Bot": "dragon",
    "ADC": "dragon",
    "Support": "support",
}

BASE_STAT_MAP = {
    "Health": "hp",
    "Health Per Level": "hp_per_level",
    "Mana": "mana",
    "Mana Per Level": "mana_per_level",
    "Attack Damage": "ad",
    "AD Per Level": "ad_per_level",
    "Attack Speed": "attack_speed",
    "AS Per Level": "attack_speed_per_level",
    "Armor": "armor",
    "Armor Per Level": "armor_per_level",
    "Magic Resist": "mr",
    "MR Per Level": "mr_per_level",
    "Movement Speed": "move_speed",
    "Range": "attack_range",
}


@dataclass
class ChampionInputs:
    official_slug: str
    en: OfficialChampionPage
    pt: OfficialChampionPage | None
    rpn: RpnChampion | None
    rpn_name: str | None
    pt_title_upper: str | None = None
    rpn_roles: list[str] = field(default_factory=list)
    icon: str | None = None
    ability_icons: dict[str, str | None] = field(default_factory=dict)


@dataclass
class ChampionResult:
    champion: Champion
    warnings: list[str]


def build_champion(inp: ChampionInputs, patch: str) -> ChampionResult:
    warnings: list[str] = []
    name_en = inp.rpn_name or title_case_en(inp.en.title)
    champ_id = slugify(name_en)
    pt_title = inp.pt.title if inp.pt else inp.pt_title_upper
    name_pt = restore_casing(pt_title, name_en) if pt_title else None

    rpn_by_key = {}
    if inp.rpn:
        for ab in inp.rpn.abilities:
            key = RPN_SLOT_TO_KEY.get(ab.slot_label or "")
            if key:
                rpn_by_key[key] = ab

    abilities: list[Ability] = []
    tags: dict[str, TagEvidence] = {}
    damage_inputs: list[tuple[str, list[str]]] = []
    for index, off in enumerate(inp.en.abilities):
        key = OFFICIAL_SLOT_TO_KEY.get(off.slot)
        if key is None:
            warnings.append(f"{champ_id}: unknown official ability slot {off.slot!r}")
            continue
        pt_ab = inp.pt.abilities[index] if inp.pt and index < len(inp.pt.abilities) else None
        rpn_ab = rpn_by_key.get(key)
        details = rpn_ab.details if rpn_ab else None
        text = " ".join(filter(None, [off.description, details]))
        labels = rpn_ab.tokens if rpn_ab else []
        damage_types = text_rules.find_damage_types(labels, text)
        cc = [m.value for m in text_rules.find_cc(text)]
        for m in text_rules.find_cc(text):
            if m.value in text_rules.HARD_CC:
                tags.setdefault("hard_cc", TagEvidence(tag="hard_cc", ability_key=key, phrase=m.phrase))
            else:
                tags.setdefault("soft_cc", TagEvidence(tag="soft_cc", ability_key=key, phrase=m.phrase))
        for m in text_rules.find_tags(text):
            tags.setdefault(m.value, TagEvidence(tag=m.value, ability_key=key, phrase=m.phrase))
        damage_inputs.append((key, damage_types))
        abilities.append(
            Ability(
                key=key,
                name_en=off.label,
                name_pt=_pt_label(pt_ab.label) if pt_ab else None,
                description_en=off.description,
                description_pt=pt_ab.description if pt_ab else None,
                details_en=details or None,
                damage_types=damage_types,
                cc_types=cc,
                cooldown=rpn_ab.cooldown if rpn_ab else None,
                icon=inp.ability_icons.get(key),
            )
        )
    if len(abilities) != 5:
        warnings.append(f"{champ_id}: expected 5 abilities, got {len(abilities)}")
    if inp.rpn is None:
        warnings.append(f"{champ_id}: no Rift Patch Notes detail page (no base stats, summary-only tags)")

    if "tank" in inp.en.classes:
        tags.setdefault("tank", TagEvidence(tag="tank", ability_key=None, phrase="official class: tank"))
    if "hard_cc" in tags and ("dash" in tags or "tank" in inp.en.classes):
        tags.setdefault(
            "engage",
            TagEvidence(tag="engage", ability_key=tags["hard_cc"].ability_key, phrase="hard CC + gap closer/tank"),
        )
    if _has_poke(inp):
        tags.setdefault(
            "poke", TagEvidence(tag="poke", ability_key=None, phrase="damaging ability with range >= 1000")
        )

    profile = text_rules.damage_profile(damage_inputs, inp.en.classes)
    base_stats = None
    if inp.rpn and inp.rpn.base_stats:
        base_stats = BaseStats(
            **{BASE_STAT_MAP[k]: v for k, v in inp.rpn.base_stats.items() if k in BASE_STAT_MAP}
        )

    roles = [LANE_TO_ROLE[r] for r in inp.rpn_roles if r in LANE_TO_ROLE]
    collected = inp.en.fetched_at
    extra = [u for u in [inp.pt.url if inp.pt else None, inp.rpn.url if inp.rpn else None] if u]
    champion = Champion(
        patch=patch,
        source_url=inp.en.url,
        collected_at=collected,
        extra_sources=extra,
        id=champ_id,
        name_en=name_en,
        name_pt=name_pt,
        title_en=inp.en.subtitle,
        title_pt=inp.pt.subtitle if inp.pt else None,
        roles=roles,
        classes=[c for c in inp.en.classes if c in ("tank", "fighter", "mage", "assassin", "marksman", "support")],
        difficulty=inp.en.difficulty,
        damage_profile=DamageProfile(**profile, method="heuristic_v1") if profile else None,
        tags=sorted(tags.values(), key=lambda t: t.tag),
        abilities=abilities,
        base_stats=base_stats,
        icon=inp.icon,
    )
    return ChampionResult(champion=champion, warnings=warnings)


def _pt_label(label: str) -> str:
    # Some official pt-BR pages render ability names in UPPERCASE; restore casing deterministically.
    return title_case_en(label) if label.isupper() else label


def _has_poke(inp: ChampionInputs) -> bool:
    if not inp.rpn:
        return False
    for ab in inp.rpn.abilities:
        tokens = [t.strip() for t in ab.tokens]
        for i, token in enumerate(tokens):
            if token == "Range:" and i + 1 < len(tokens):
                numbers = [
                    float(x) for x in tokens[i + 1].replace("/", " ").split() if x.replace(".", "").isdigit()
                ]
                if numbers and max(numbers) >= 1000 and ab.damage_types:
                    return True
    return False
