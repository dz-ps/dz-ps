"""Pydantic models: the source of truth for every bundle the pipeline publishes (DECISIONS.md D4).

packages/shared/src/schemas mirrors these in zod; contracts/ keeps both in sync.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:_[a-z0-9]+)*$")]
PatchVersion = Annotated[str, StringConstraints(pattern=r"^\d+\.\d+[a-z]?$")]
IsoDateTime = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")]
IsoDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
HttpsUrl = Annotated[str, StringConstraints(pattern=r"^https://")]

Role = Literal["baron", "jungle", "mid", "dragon", "support"]
ChampionClass = Literal["tank", "fighter", "mage", "assassin", "marksman", "support"]
ChampionTag = Literal[
    "tank",
    "engage",
    "poke",
    "heal",
    "shield",
    "hard_cc",
    "soft_cc",
    "dash",
    "invulnerability",
    "projectile_reflect",
    "execute",
    "scaling",
]
CcType = Literal[
    "stun",
    "airborne",
    "suppression",
    "root",
    "charm",
    "fear",
    "taunt",
    "sleep",
    "polymorph",
    "slow",
    "silence",
    "blind",
    "ground",
    "cripple",
]
DamageType = Literal["physical", "magic", "true"]
AbilityKey = Literal["P", "Q", "W", "E", "R"]
ItemCategory = Literal["physical", "magic", "defense", "support", "boots", "component"]
ItemTag = Literal[
    "anti_heal",
    "tenacity",
    "spell_shield",
    "stasis",
    "armor_pen",
    "magic_pen",
    "on_hit",
    "spellblade",
    "lifesteal",
    "omnivamp",
    "armor",
    "magic_resist",
    "health",
    "ability_power",
    "attack_damage",
    "attack_speed",
    "crit",
    "ability_haste",
    "shield",
    "heal_shield_power",
    "active",
]
RunePath = Literal["domination", "precision", "resolve", "sorcery"]
ChangeKind = Literal["buff", "nerf", "change"]
StatKey = Literal[
    "ad",
    "ap",
    "hp",
    "armor",
    "mr",
    "attack_speed",
    "crit",
    "ability_haste",
    "move_speed",
    "move_speed_pct",
    "armor_pen",
    "armor_pen_pct",
    "magic_pen",
    "magic_pen_pct",
    "lifesteal",
    "omnivamp",
    "heal_shield_power",
    "tenacity",
    "mana",
    "mana_regen",
    "hp_regen",
]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)


class Provenance(Model):
    game: Literal["wild_rift"] = "wild_rift"
    patch: PatchVersion
    source_url: HttpsUrl
    collected_at: IsoDateTime
    extra_sources: list[HttpsUrl] = Field(default_factory=list)


class TagEvidence(Model):
    """Why a derived tag exists: which ability and which phrase triggered it (DECISIONS.md D11)."""

    tag: ChampionTag
    ability_key: AbilityKey | None
    phrase: str
    source: Literal["derived", "override"] = "derived"


class Ability(Model):
    key: AbilityKey
    name_en: str
    name_pt: str | None
    description_en: str
    description_pt: str | None
    details_en: str | None = None
    damage_types: list[DamageType] = Field(default_factory=list)
    cc_types: list[CcType] = Field(default_factory=list)
    cooldown: str | None = None
    icon: str | None


class DamageProfile(Model):
    physical: float = Field(ge=0, le=1)
    magic: float = Field(ge=0, le=1)
    true: float = Field(ge=0, le=1)
    method: Literal["heuristic_v1", "override"]


class BaseStats(Model):
    hp: float | None = None
    hp_per_level: float | None = None
    mana: float | None = None
    mana_per_level: float | None = None
    ad: float | None = None
    ad_per_level: float | None = None
    attack_speed: float | None = None
    attack_speed_per_level: float | None = None
    armor: float | None = None
    armor_per_level: float | None = None
    mr: float | None = None
    mr_per_level: float | None = None
    move_speed: float | None = None
    attack_range: float | None = None


class Champion(Provenance):
    id: Slug
    name_en: str
    name_pt: str | None
    title_en: str | None = None
    title_pt: str | None = None
    aliases: list[str] = Field(default_factory=list)
    roles: list[Role] = Field(default_factory=list)
    classes: list[ChampionClass] = Field(default_factory=list)
    difficulty: int | None = Field(default=None, ge=1, le=3)
    damage_profile: DamageProfile | None
    tags: list[TagEvidence] = Field(default_factory=list)
    abilities: list[Ability]
    base_stats: BaseStats | None
    icon: str | None


class ItemEffect(Model):
    name: str
    kind: Literal["passive", "active"]
    unique: bool
    description: str
    cooldown: str | None = None


class Item(Provenance):
    id: Slug
    name_en: str
    name_pt: str | None
    category: ItemCategory
    source_category: str
    tier: int = Field(ge=1, le=4)
    cost: int | None = Field(ge=0)
    recipe: list[Slug] = Field(default_factory=list)
    stats: dict[StatKey, float] = Field(default_factory=dict)
    raw_stats: dict[str, float | str] = Field(default_factory=dict)
    passives: list[ItemEffect] = Field(default_factory=list)
    actives: list[ItemEffect] = Field(default_factory=list)
    tags: list[ItemTag] = Field(default_factory=list)
    unique_groups: list[Slug] = Field(default_factory=list)
    limit: int | None = Field(default=None, ge=1)
    limit_group: Slug | None = None
    purchasable: bool = True
    transforms_from: Slug | None = None
    icon: str | None
    last_changed_patch: PatchVersion | None = None
    last_change: ChangeKind | None = None


class Rune(Provenance):
    id: Slug
    name_en: str
    name_pt: str | None
    kind: Literal["keystone", "minor"]
    path: RunePath | None
    slot: int | None = Field(default=None, ge=1, le=3)
    description: str
    icon: str | None


class SummonerSpell(Provenance):
    id: Slug
    name_en: str
    name_pt: str | None
    cooldown: float | None
    description: str
    icon: str | None
    jungle_only: bool
    selectable: bool = True


class PatchChange(Model):
    entity_kind: Literal["champion", "item", "rune", "spell", "system"]
    entity_id: Slug
    change: ChangeKind
    summary: str | None = None
    before: str | None = None
    after: str | None = None


class Patch(Model):
    version: PatchVersion
    date: IsoDate | None
    notes_url: HttpsUrl | None
    changes: list[PatchChange] = Field(default_factory=list)
    source_url: HttpsUrl
    collected_at: IsoDateTime


class RunePageRule(Model):
    keystones: int = 1
    primary_slots: list[int] = Field(default_factory=lambda: [1, 2, 3])
    secondary_count: int = 1
    secondary_must_differ_from_primary: bool = True
    keystone_tied_to_primary_path: bool = False
    source_text: str | None = None


class RuleFlag(Model):
    """A rule value plus whether a human confirmed it (DECISIONS.md D12)."""

    confirmed: bool
    note: str | None = None


class Rules(Model):
    item_slots: int = Field(ge=1, le=8)
    boots_max: int = 1
    boots_category: ItemCategory = "boots"
    unique_passives_do_not_stack: bool = True
    jungle_requires_spell: Slug | None = "smite"
    rune_page: RunePageRule
    max_level: int = Field(ge=1, le=30)
    stat_growth: Literal["linear_estimate", "unconfirmed"]
    flags: dict[str, RuleFlag] = Field(default_factory=dict)


class MetaStat(Model):
    champion_id: Slug
    role: Role
    rank_tier: str
    patch: PatchVersion
    win_rate: float = Field(ge=0, le=100)
    pick_rate: float = Field(ge=0, le=100)
    ban_rate: float = Field(ge=0, le=100)
    source_tier: int | None = None
    source_url: HttpsUrl
    collected_at: IsoDateTime


class MetaBuild(Model):
    champion_id: Slug
    role: Role
    core_items: list[Slug]
    boots: Slug | None = None
    runes: list[Slug] = Field(default_factory=list)
    spells: list[Slug] = Field(default_factory=list)
    win_rate: float | None = Field(default=None, ge=0, le=100)
    pick_rate: float | None = Field(default=None, ge=0, le=100)
    patch: PatchVersion
    source_url: HttpsUrl
    collected_at: IsoDateTime


class Matchup(Model):
    champion_id: Slug
    opponent_id: Slug
    role: Role
    win_rate: float | None = None
    derived: bool
    source_url: HttpsUrl | None
    collected_at: IsoDateTime


class SourceStatus(Model):
    id: Literal["wr_official", "lol_wiki", "riftpatchnotes"]
    status: Literal["used", "disallowed", "unreachable", "skipped"]
    robots: str
    checked_at: IsoDateTime
    note: str | None = None


class CatalogBundle(Model):
    schema_version: Literal[1] = 1
    kind: Literal["catalog"] = "catalog"
    game: Literal["wild_rift"] = "wild_rift"
    patch: PatchVersion
    fixture: bool = False
    partial: bool = False
    generated_by: str
    sources: list[SourceStatus]
    champions: list[Champion]
    items: list[Item]
    runes: list[Rune]
    summoner_spells: list[SummonerSpell]
    patches: list[Patch]
    rules: Rules
    aliases: dict[str, Slug] = Field(default_factory=dict)


class MetaBundle(Model):
    schema_version: Literal[1] = 1
    kind: Literal["meta"] = "meta"
    game: Literal["wild_rift"] = "wild_rift"
    patch: PatchVersion
    fixture: bool = False
    rank_tiers: list[str]
    stats: list[MetaStat]
    builds: list[MetaBuild]
    matchups: list[Matchup] = Field(default_factory=list)
    source_url: HttpsUrl
    source_name: str
    source_note: str
    collected_at: IsoDateTime


class ManifestEntry(Model):
    patch: PatchVersion
    hash: Annotated[str, StringConstraints(pattern=r"^sha256:[0-9a-f]{64}$")]
    path: str
    bytes: int = Field(ge=0)
    published_at: IsoDateTime


class GamePatchInfo(Model):
    version: PatchVersion
    source_url: HttpsUrl
    detected_at: IsoDateTime


class Manifest(Model):
    schema_version: Literal[1] = 1
    game: Literal["wild_rift"] = "wild_rift"
    game_patch: GamePatchInfo
    catalog: ManifestEntry | None
    meta: ManifestEntry | None
    icons_base: str
    verified_at: IsoDateTime
