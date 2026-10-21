"""Runes, summoner spells, patches, meta stats/builds and rules."""

import re
from dataclasses import dataclass

from ..ids import slugify
from ..models import (
    MetaBuild,
    MetaStat,
    Patch,
    PatchChange,
    Rune,
    RunePageRule,
    SummonerSpell,
)
from ..sources.riftpatchnotes import RpnRune, RpnSpell
from .champions import LANE_TO_ROLE

PATHS = {"Domination": "domination", "Precision": "precision", "Resolve": "resolve", "Sorcery": "sorcery"}


def build_runes(
    raw: list[RpnRune], patch: str, source_url: str, collected_at: str
) -> tuple[list[Rune], list[str]]:
    runes: list[Rune] = []
    warnings: list[str] = []
    for r in raw:
        if r.section == "Keystones":
            kind, path, slot = "keystone", None, None
        elif r.section in PATHS:
            match = re.match(r"Slot (\d)", r.slot_label)
            if not match:
                warnings.append(f"rune {r.slug}: unexpected slot label {r.slot_label!r}")
                continue
            kind, path, slot = "minor", PATHS[r.section], int(match.group(1))
        else:
            warnings.append(f"rune {r.slug}: unknown section {r.section!r}")
            continue
        runes.append(
            Rune(
                patch=patch,
                source_url=source_url,
                collected_at=collected_at,
                id=slugify(r.name),
                name_en=r.name,
                name_pt=None,  # TODO: no confirmed pt-BR source for rune names yet
                kind=kind,
                path=path,
                slot=slot,
                description=r.description.strip(),
                icon=r.icon,
            )
        )
    runes.sort(key=lambda r: (r.kind != "keystone", r.path or "", r.slot or 0, r.id))
    return runes, warnings


def build_rune_rule(source_text: str | None) -> RunePageRule | None:
    """Derive the rune page rule from the source's own description (confirmed per patch, D12)."""
    if not source_text:
        return None
    text = source_text.lower()
    if (
        "one keystone" in text
        and "each of the three slots of a primary path" in text
        and "one rune from any slot of a different path" in text
    ):
        return RunePageRule(
            keystones=1,
            primary_slots=[1, 2, 3],
            secondary_count=1,
            secondary_must_differ_from_primary=True,
            keystone_tied_to_primary_path=False,
            source_text=source_text,
        )
    return None


_TRANSFORMS = re.compile(r"transforms into ([A-Z][\w' ]+?)(?: after|\.|,)", re.I)


def build_spells(raw: list[RpnSpell], patch: str, source_url: str, collected_at: str) -> list[SummonerSpell]:
    transformed: dict[str, str] = {}
    for s in raw:
        for m in _TRANSFORMS.finditer(s.description):
            transformed[slugify(m.group(1))] = slugify(s.name)
    spells = []
    for s in raw:
        spell_id = slugify(s.name)
        parent = transformed.get(spell_id)
        mentions_monsters = bool(re.search(r"\bmonsters?\b", s.description, re.I))
        jungle_only = mentions_monsters or (parent is not None and parent in {"smite"})
        spells.append(
            SummonerSpell(
                patch=patch,
                source_url=source_url,
                collected_at=collected_at,
                id=spell_id,
                name_en=s.name,
                name_pt=None,  # TODO: no confirmed pt-BR source for spell names yet
                cooldown=s.cooldown,
                description=s.description.strip(),
                icon=s.icon,
                jungle_only=jungle_only,
                selectable=parent is None,
            )
        )
    spells.sort(key=lambda s: s.id)
    return spells


def build_patch(
    version: str,
    date: str | None,
    notes_url: str | None,
    latest: dict,
    item_slug_to_id: dict[str, str],
    champ_slug_to_id: dict[str, str],
    source_url: str,
    collected_at: str,
) -> Patch:
    changes: list[PatchChange] = []
    if latest.get("version") == version:
        for slug, kind in (latest.get("champions") or {}).items():
            if slug in champ_slug_to_id and kind in ("buff", "nerf", "change"):
                changes.append(PatchChange(entity_kind="champion", entity_id=champ_slug_to_id[slug], change=kind))
        for slug, kind in (latest.get("items") or {}).items():
            if slug in item_slug_to_id and kind in ("buff", "nerf", "change"):
                changes.append(PatchChange(entity_kind="item", entity_id=item_slug_to_id[slug], change=kind))
        for slug, kind in (latest.get("systems") or {}).items():
            if kind in ("buff", "nerf", "change"):
                changes.append(PatchChange(entity_kind="system", entity_id=slugify(slug), change=kind))
    return Patch(
        version=version,
        date=date,
        notes_url=notes_url,
        changes=changes,
        source_url=source_url,
        collected_at=collected_at,
    )


@dataclass
class MetaResult:
    stats: list[MetaStat]
    builds: list[MetaBuild]
    rank_tiers: list[str]
    warnings: list[str]


def build_meta(
    winrates: dict,
    builds: list[dict],
    champ_slug_to_id: dict[str, str],
    item_name_to_id: dict[str, str],
    patch: str,
    winrates_url: str,
    builds_url: str,
    collected_at: str,
) -> MetaResult:
    warnings: list[str] = []
    rank_tiers = winrates.get("rankTiers") or {}
    positions = winrates.get("positions") or {}
    stats: list[MetaStat] = []
    unknown: set[str] = set()
    source_patch = winrates.get("patch")
    if source_patch and source_patch != patch:
        warnings.append(f"meta source is on patch {source_patch}, catalog is {patch}")
    for e in winrates.get("entries") or []:
        champ_id = champ_slug_to_id.get(e.get("slug"))
        role = LANE_TO_ROLE.get(positions.get(str(e.get("position")), ""))
        rank = rank_tiers.get(str(e.get("rank")))
        if not champ_id:
            unknown.add(str(e.get("slug")))
            continue
        if not role or not rank:
            warnings.append(f"meta entry with unknown rank/position: {e}")
            continue
        stats.append(
            MetaStat(
                champion_id=champ_id,
                role=role,
                rank_tier=rank,
                patch=source_patch or patch,
                win_rate=float(e["winRate"]),
                pick_rate=float(e["pickRate"]),
                ban_rate=float(e["banRate"]),
                source_tier=e.get("tier") if isinstance(e.get("tier"), int) else None,
                source_url=winrates_url,
                collected_at=_iso(winrates.get("updatedAt")) or collected_at,
            )
        )
    if unknown:
        warnings.append(f"meta: champions not in catalog: {sorted(unknown)}")

    meta_builds: list[MetaBuild] = []
    for b in builds:
        champ_id = champ_slug_to_id.get(b.get("slug"))
        role = LANE_TO_ROLE.get(b.get("role") or "")
        if not champ_id or not role:
            continue
        core, missing = [], []
        for item in b.get("items") or []:
            item_id = item_name_to_id.get(item.get("name"))
            (core if item_id else missing).append(item_id or item.get("name"))
        if missing:
            warnings.append(f"meta build {champ_id}: items not in catalog {missing}")
        meta_builds.append(
            MetaBuild(
                champion_id=champ_id,
                role=role,
                core_items=[c for c in core if c],
                win_rate=_float(b.get("win")),
                pick_rate=_float(b.get("pick")),
                patch=source_patch or patch,
                source_url=builds_url,
                collected_at=collected_at,
            )
        )
    return MetaResult(stats=stats, builds=meta_builds, rank_tiers=list(rank_tiers.values()), warnings=warnings)


def _float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _iso(value: object) -> str | None:
    if isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", value):
        return value[:19] + "Z"
    return None
