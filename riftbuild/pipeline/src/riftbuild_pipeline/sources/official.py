"""Official Wild Rift website (wildrift.leagueoflegends.com): patch detection, champions, pt-BR names.

The site is a Next.js app; every page embeds its CMS content in `<script id="__NEXT_DATA__">`.
"""

import html
import json
import re
from dataclasses import dataclass, field

from ..config import OFFICIAL_BASE
from ..http.client import PoliteClient

_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
_PATCH_SLUG = re.compile(r"/(?:wild-rift-)?patch-notes-(\d+)-(\d+)([a-z]?)(?:-|/|$)")
_PATCH_SLUG_COMPACT = re.compile(r"/(?:wild-rift-)?patch-notes-(\d)(\d)([a-z]?)(?:-|/|$)")
_URL_BLOCK = re.compile(r"<url>(.*?)</url>", re.S)
_TAG = re.compile(r"<[^>]+>")


@dataclass
class PatchNotesRef:
    version: str
    url: str
    lastmod: str | None
    url_pt: str | None = None


@dataclass
class ChampionCard:
    slug: str  # URL slug, e.g. "dr-mundo"
    title_upper: str
    card_url: str
    page_url: str


@dataclass
class OfficialAbility:
    label: str
    slot: str  # "PASSIVE" / "PASSIVA" / "1" / "2" / "3" / "ULTIMATE"
    description: str
    icon_url: str | None


@dataclass
class OfficialChampionPage:
    url: str
    title: str
    subtitle: str | None
    classes: list[str] = field(default_factory=list)
    difficulty: int | None = None
    abilities: list[OfficialAbility] = field(default_factory=list)
    fetched_at: str = ""


def next_data(page_html: str) -> dict:
    match = _NEXT_DATA.search(page_html)
    if not match:
        raise ValueError("page has no __NEXT_DATA__")
    return json.loads(match.group(1))


def html_to_text(fragment: str) -> str:
    text = _TAG.sub("", fragment.replace("<br>", " ").replace("<br/>", " "))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def parse_patch_version(url: str) -> str | None:
    for pattern in (_PATCH_SLUG, _PATCH_SLUG_COMPACT):
        match = pattern.search(url)
        if match:
            return f"{int(match.group(1))}.{int(match.group(2))}{match.group(3)}"
    return None


def version_key(version: str) -> tuple[int, int, str]:
    match = re.match(r"^(\d+)\.(\d+)([a-z]?)$", version)
    if not match:
        return (0, 0, "")
    return (int(match.group(1)), int(match.group(2)), match.group(3))


def parse_patch_notes_sitemap(xml: str) -> list[PatchNotesRef]:
    refs: list[PatchNotesRef] = []
    for block in _URL_BLOCK.findall(xml):
        loc = re.search(r"<loc>([^<]+)</loc>", block)
        if not loc or "patch-notes" not in loc.group(1) or "/en-us/" not in loc.group(1):
            continue
        version = parse_patch_version(loc.group(1))
        if not version:
            continue
        lastmod = re.search(r"<lastmod>([^<]+)</lastmod>", block)
        pt = re.search(r'hreflang="pt-br" href="([^"]+)"', block)
        refs.append(
            PatchNotesRef(
                version=version,
                url=loc.group(1),
                lastmod=lastmod.group(1) if lastmod else None,
                url_pt=pt.group(1) if pt else None,
            )
        )
    return refs


def latest_patch(refs: list[PatchNotesRef]) -> PatchNotesRef | None:
    if not refs:
        return None
    return max(refs, key=lambda r: (version_key(r.version), r.lastmod or ""))


def detect_patch(client: PoliteClient) -> tuple[PatchNotesRef | None, str]:
    url = f"{OFFICIAL_BASE}/en-us/sitemap_loc.xml"
    resp = client.get(url, max_age_s=3600)
    return latest_patch(parse_patch_notes_sitemap(resp.text)), resp.fetched_at


def parse_champion_list(page_html: str) -> list[ChampionCard]:
    blades = next_data(page_html)["props"]["pageProps"]["page"]["blades"]
    grid = next(b for b in blades if b.get("type") == "characterCardGrid")
    cards = []
    for item in grid["items"]:
        path = item["action"]["payload"]["url"]
        slug = path.rstrip("/").rsplit("/", 1)[-1]
        cards.append(
            ChampionCard(
                slug=slug,
                title_upper=item["title"],
                card_url=item["media"]["url"],
                page_url=f"{OFFICIAL_BASE}{path}",
            )
        )
    return cards


def fetch_champion_list(client: PoliteClient, locale: str) -> tuple[list[ChampionCard], str, str]:
    url = f"{OFFICIAL_BASE}/{locale}/champions/"
    resp = client.get(url)
    return parse_champion_list(resp.text), url, resp.fetched_at


def parse_champion_page(page_html: str, url: str) -> OfficialChampionPage:
    blades = next_data(page_html)["props"]["pageProps"]["page"]["blades"]
    masthead = next(b for b in blades if b.get("type") == "characterMasthead")
    page = OfficialChampionPage(
        url=url,
        title=masthead["title"],
        subtitle=masthead.get("subtitle"),
        classes=[r["id"] for r in (masthead.get("role") or {}).get("roles", [])],
        difficulty=(masthead.get("difficulty") or {}).get("value"),
    )
    tab = next((b for b in blades if b.get("type") == "iconTab"), None)
    for group in (tab or {}).get("groups", []):
        content = group.get("content") or {}
        description = (content.get("description") or {}).get("body", "")
        page.abilities.append(
            OfficialAbility(
                label=group.get("label") or content.get("title") or "",
                slot=str(content.get("subtitle") or "").strip().upper(),
                description=html_to_text(description),
                icon_url=(group.get("thumbnail") or {}).get("url"),
            )
        )
    return page


def fetch_champion_page(client: PoliteClient, page_url: str) -> OfficialChampionPage:
    resp = client.get(page_url)
    page = parse_champion_page(resp.text, page_url)
    page.fetched_at = resp.fetched_at
    return page
