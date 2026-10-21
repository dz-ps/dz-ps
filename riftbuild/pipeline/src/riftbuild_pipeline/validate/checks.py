"""Publish gate (spec §4.3 + project rules). Any blocking issue stops the publish."""

import json
import re
from dataclasses import dataclass, field

from ..models import CatalogBundle, MetaBundle

FORBIDDEN_URL = re.compile(
    r"ddragon\.leagueoflegends\.com|communitydragon\.org|\bu\.gg\b|\bop\.gg\b|mobalytics\.gg|lolalytics\.com"
    r"|leagueofgraphs\.com|metasrc\.com|riftpatchnotes\.com/lol\b",
    re.I,
)
MAX_DROP = 0.10


@dataclass
class Report:
    blocking: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.blocking


def check_catalog(bundle: CatalogBundle, previous: CatalogBundle | None = None) -> Report:
    report = Report()
    b, w = report.blocking, report.warnings

    if bundle.fixture:
        b.append("bundle is marked fixture=true (fixtures are never published)")
    if bundle.partial:
        b.append("bundle is marked partial=true (some source failed)")

    kinds = {
        "champions": bundle.champions,
        "items": bundle.items,
        "runes": bundle.runes,
        "summoner_spells": bundle.summoner_spells,
    }
    for kind, entities in kinds.items():
        if not entities:
            b.append(f"no {kind} in bundle")
        ids = [e.id for e in entities]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            b.append(f"duplicate {kind} ids: {dupes}")
        no_icon = [e.id for e in entities if not e.icon]
        if no_icon:
            b.append(f"{kind} without icon: {no_icon}")
        for e in entities:
            if e.game != "wild_rift" or not e.source_url or not e.collected_at or e.patch != bundle.patch:
                b.append(f"{kind} {e.id}: missing/invalid provenance")

    for item in bundle.items:
        if item.cost is None and item.purchasable:
            b.append(f"item {item.id} has no cost")
        if not item.purchasable and item.transforms_from is None:
            b.append(f"item {item.id} is not purchasable but has no transforms_from")
        unknown = [r for r in item.recipe if r not in {i.id for i in bundle.items}]
        if unknown:
            b.append(f"item {item.id} recipe references unknown ids {unknown}")

    _check_runes(bundle, report)
    _check_spells(bundle, report)

    text = bundle.model_dump_json()
    if FORBIDDEN_URL.search(text):
        b.append(f"bundle references a forbidden LoL PC source: {FORBIDDEN_URL.search(text).group(0)}")

    champ_ids = {c.id for c in bundle.champions}
    bad_aliases = {a: t for a, t in bundle.aliases.items() if t not in champ_ids}
    if bad_aliases:
        w.append(f"aliases pointing to unknown champions were dropped upstream: {bad_aliases}")

    for c in bundle.champions:
        if not c.name_pt:
            w.append(f"champion {c.id}: no pt-BR name (English shown)")
        if c.base_stats is None:
            w.append(f"champion {c.id}: no base stats")
        if len(c.abilities) != 5:
            w.append(f"champion {c.id}: {len(c.abilities)} abilities")
        if not c.roles:
            w.append(f"champion {c.id}: no lane roles")

    if previous is not None:
        for kind, entities in kinds.items():
            before = len(getattr(previous, kind))
            after = len(entities)
            if before and (before - after) / before > MAX_DROP:
                b.append(f"{kind} count dropped more than 10%: {before} -> {after}")
            prev_names = {e.id: e.name_en for e in getattr(previous, kind)}
            for e in entities:
                if e.id in prev_names and prev_names[e.id] != e.name_en:
                    b.append(f"{kind} {e.id} changed name: {prev_names[e.id]!r} -> {e.name_en!r}")
    else:
        report.info["baseline"] = "first publish: count-drop and rename checks skipped"

    report.info["counts"] = {k: len(v) for k, v in kinds.items()}
    return report


def _check_runes(bundle: CatalogBundle, report: Report) -> None:
    rule = bundle.rules.rune_page
    keystones = [r for r in bundle.runes if r.kind == "keystone"]
    if len(keystones) < rule.keystones:
        report.blocking.append("not enough keystones for a valid rune page")
    paths: dict[str, set[int]] = {}
    for r in bundle.runes:
        if r.kind == "minor":
            if r.path is None or r.slot is None:
                report.blocking.append(f"minor rune {r.id} has no path/slot")
                continue
            paths.setdefault(r.path, set()).add(r.slot)
    for path, slots in paths.items():
        missing = set(rule.primary_slots) - slots
        if missing:
            report.blocking.append(f"rune path {path} has no runes for slots {sorted(missing)}")
    if len(paths) < 2 and rule.secondary_must_differ_from_primary:
        report.blocking.append("rune page needs at least two paths")


def _check_spells(bundle: CatalogBundle, report: Report) -> None:
    required = bundle.rules.jungle_requires_spell
    if required and required not in {s.id for s in bundle.summoner_spells}:
        report.blocking.append(f"jungle rule requires spell {required!r}, which is not in the catalog")


def check_meta(meta: MetaBundle, catalog: CatalogBundle) -> Report:
    report = Report()
    champ_ids = {c.id for c in catalog.champions}
    item_ids = {i.id for i in catalog.items}
    if meta.fixture:
        report.blocking.append("meta bundle is marked fixture=true")
    for s in meta.stats:
        if s.champion_id not in champ_ids:
            report.blocking.append(f"meta stat for unknown champion {s.champion_id}")
        if not s.source_url or not s.collected_at:
            report.blocking.append(f"meta stat {s.champion_id}/{s.role} without source/date")
    for build in meta.builds:
        unknown = [i for i in build.core_items if i not in item_ids]
        if unknown:
            report.blocking.append(f"meta build {build.champion_id} references unknown items {unknown}")
    if FORBIDDEN_URL.search(json.dumps(meta.model_dump())):
        report.blocking.append("meta bundle references a forbidden LoL PC source")
    report.info["counts"] = {"stats": len(meta.stats), "builds": len(meta.builds)}
    return report
