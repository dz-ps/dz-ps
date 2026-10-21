"""Rift Patch Notes (www.riftpatchnotes.com): Wild Rift items, runes, spells, meta stats and builds.

The site serves both Wild Rift and LoL PC; the guard blocks the PC section (/lol). Data is read from the
React Server Components payload (parse/rsc.py); no page code is executed.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from ..config import RPN_BASE
from ..http.client import PoliteClient
from ..parse.rsc import extract_flight, find_dicts, iter_elements, parse_rows, resolve


@dataclass
class RpnPage:
    url: str
    fetched_at: str
    tree: list[Any]
    flight: str


def fetch_page(client: PoliteClient, path: str) -> RpnPage:
    url = f"{RPN_BASE}{path}"
    resp = client.get(url)
    flight = extract_flight(resp.text)
    rows = parse_rows(flight)
    tree = [resolve(v, rows) for v in rows.values() if isinstance(v, list | dict)]
    return RpnPage(url=url, fetched_at=resp.fetched_at, tree=tree, flight=flight)


def asset_url(path: str | None) -> str | None:
    if not path:
        return None
    return path if path.startswith("https://") else f"{RPN_BASE}{path}"


# -- items ----------------------------------------------------------------------------------------
def parse_items(page: RpnPage) -> dict:
    found = next(find_dicts(page.tree, lambda d: "itemStats" in d and "items" in d), None)
    if found is None:
        raise ValueError("items payload not found")
    if found.get("game") != "wr":
        raise ValueError(f"items payload is not Wild Rift (game={found.get('game')!r})")
    return found


# -- runes ----------------------------------------------------------------------------------------
@dataclass
class RpnRune:
    slug: str
    name: str
    description: str
    icon: str | None
    section: str  # "Keystones" | "Domination" | ...
    slot_label: str  # "Choose one keystone" | "Slot 1" | ...


RUNE_RULE_PATTERN = re.compile(r"[^.\"]*one keystone[^.\"]*\.")


def parse_runes(page: RpnPage) -> tuple[list[RpnRune], str | None]:
    runes: dict[str, RpnRune] = {}
    for _type, _key, props, ancestors in iter_elements(page.tree):
        if props.get("surface") != "rune-browser" or "slug" not in props:
            continue
        sections = [key for typ, key in ancestors if typ == "section" and isinstance(key, str)]
        slots = [
            key
            for typ, key in ancestors
            if typ == "div" and isinstance(key, str) and (key.startswith("Slot") or "keystone" in key.lower())
        ]
        if not sections or not slots:
            continue
        slug = props["slug"]
        if slug in runes:
            continue
        runes[slug] = RpnRune(
            slug=slug,
            name=props.get("name") or slug,
            description=props.get("description") or "",
            icon=asset_url(props.get("iconSrc")),
            section=sections[-1],
            slot_label=slots[-1],
        )
    rule = RUNE_RULE_PATTERN.search(page.flight)
    return list(runes.values()), rule.group(0).strip() if rule else None


# -- spells ---------------------------------------------------------------------------------------
@dataclass
class RpnSpell:
    slug: str
    name: str
    cooldown: float | None
    description: str
    icon: str | None


def parse_spells(page: RpnPage) -> list[RpnSpell]:
    spells: dict[str, RpnSpell] = {}
    for _type, _key, props, _anc in iter_elements(page.tree):
        icon = props.get("iconSrc") or ""
        if props.get("surface") != "catalog-tile" or not icon.startswith("/spells/") or "slug" not in props:
            continue
        cooldown = props.get("cooldown")
        spells.setdefault(
            props["slug"],
            RpnSpell(
                slug=props["slug"],
                name=props.get("name") or props["slug"],
                cooldown=float(cooldown) if isinstance(cooldown, int | float) else None,
                description=props.get("description") or "",
                icon=asset_url(icon),
            ),
        )
    return list(spells.values())


# -- win rates ------------------------------------------------------------------------------------
def parse_winrates(page: RpnPage) -> dict:
    found = next(find_dicts(page.tree, lambda d: "entries" in d and "rankTiers" in d), None)
    if found is None:
        raise ValueError("win rate payload not found")
    if found.get("game") != "wr":
        raise ValueError(f"win rate payload is not Wild Rift (game={found.get('game')!r})")
    return found


# -- builds ---------------------------------------------------------------------------------------
def parse_builds(page: RpnPage) -> list[dict]:
    def is_builds(d: dict) -> bool:
        champs = d.get("champions")
        return isinstance(champs, list) and bool(champs) and isinstance(champs[0], dict) and "items" in champs[0]

    found = next(find_dicts(page.tree, is_builds), None)
    if found is None:
        raise ValueError("builds payload not found")
    return found["champions"]


# -- champion detail ------------------------------------------------------------------------------
@dataclass
class RpnAbility:
    name: str
    slot_label: str | None
    tokens: list[str] = field(default_factory=list)

    @property
    def cooldown(self) -> str | None:
        return _token_after(self.tokens, "CD:")

    @property
    def details(self) -> str:
        sentences = [t.strip() for t in self.tokens if len(t.strip()) > 25 and not t.strip().startswith("[img")]
        return " ".join(sentences)


@dataclass
class RpnChampion:
    url: str
    fetched_at: str
    base_stats: dict[str, float]
    abilities: list[RpnAbility]


def _token_after(tokens: list[str], label: str) -> str | None:
    for i, token in enumerate(tokens):
        if token.strip() == label.strip() and i + 1 < len(tokens):
            value = tokens[i + 1].strip()
            return value or None
    return None


def _flatten(node: Any, out: list[str]) -> None:
    if isinstance(node, bool) or node is None:
        return
    if isinstance(node, str | int | float):
        out.append(str(node))
    elif isinstance(node, list):
        if len(node) == 4 and node[0] == "$" and isinstance(node[3], dict):
            props = node[3]
            if props.get("src") and props.get("alt"):
                out.append(f"[img {props['src']}]")
            _flatten(props.get("children"), out)
        else:
            for item in node:
                _flatten(item, out)


def _ability_header(node: Any, depth: int = 0) -> dict | None:
    if depth > 7:
        return None
    if isinstance(node, list):
        if len(node) == 4 and node[0] == "$" and isinstance(node[3], dict):
            if "abilityName" in node[3]:
                return node[3]
            return _ability_header(node[3].get("children"), depth + 1)
        for item in node:
            found = _ability_header(item, depth + 1)
            if found:
                return found
    return None


def parse_champion(page: RpnPage) -> RpnChampion:
    base_stats: dict[str, float] = {}
    candidates: dict[str, list[list[str]]] = {}
    slot_labels: dict[str, str] = {}

    def walk(node: Any) -> None:
        if isinstance(node, list):
            if len(node) == 4 and node[0] == "$" and isinstance(node[3], dict):
                props = node[3]
                if props.get("id") == "base-stats":
                    for _t, key, child_props, _a in iter_elements(props.get("children")):
                        if isinstance(key, str) and _t == "div":
                            tokens: list[str] = []
                            _flatten(child_props.get("children"), tokens)
                            numbers = [t for t in tokens if re.fullmatch(r"-?\d+(?:\.\d+)?", t.strip())]
                            if numbers:
                                base_stats[key] = float(numbers[-1])
                header = _ability_header(props.get("children")) if node[1] == "div" else None
                if header:
                    ability_list = header.get("abilityList")
                    for entry in ability_list if isinstance(ability_list, list) else []:
                        if isinstance(entry, dict):
                            slot_labels.setdefault(entry.get("name", ""), entry.get("slotLabel", ""))
                    tokens = []
                    _flatten(props.get("children"), tokens)
                    candidates.setdefault(header["abilityName"], []).append(tokens)
                walk(props.get("children"))
            else:
                for item in node:
                    walk(item)

    for root in page.tree:
        walk(root)

    abilities = []
    for name, token_lists in candidates.items():
        # The ability's own block is the largest subtree that still holds exactly one ability icon.
        usable = [t for t in token_lists if sum(1 for x in t if x.startswith("[img /abilities/")) == 1]
        if not usable:
            continue
        best = max(usable, key=lambda t: sum(len(x) for x in t))
        abilities.append(RpnAbility(name=name, slot_label=slot_labels.get(name), tokens=best))
    return RpnChampion(url=page.url, fetched_at=page.fetched_at, base_stats=base_stats, abilities=abilities)
