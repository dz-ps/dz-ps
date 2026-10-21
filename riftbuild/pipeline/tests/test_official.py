import json

from riftbuild_pipeline.sources.official import (
    PatchNotesRef,
    latest_patch,
    parse_champion_list,
    parse_champion_page,
    parse_patch_notes_sitemap,
    parse_patch_version,
)


def test_parse_patch_version() -> None:
    assert parse_patch_version("/en-us/news/game-updates/wild-rift-patch-notes-7-3b/") == "7.3b"
    assert parse_patch_version("/en-us/news/game-updates/wild-rift-patch-notes-6-2k/") == "6.2k"
    assert parse_patch_version("/en-us/news/game-updates/wild-rift-patch-notes-70/") == "7.0"
    assert parse_patch_version("/en-us/news/game-updates/wild-rift-patch-notes-71d-something/") == "7.1d"
    assert parse_patch_version("/en-us/news/game-updates/wild-rift-closed-beta-patch-notes/") is None


def test_latest_patch_uses_version_order() -> None:
    refs = [
        PatchNotesRef("7.3", "u1", "2026-09-22T00:00:00Z"),
        PatchNotesRef("7.3b", "u2", "2026-10-14T09:00:00Z"),
        PatchNotesRef("7.2e", "u3", "2026-10-20T00:00:00Z"),
    ]
    assert latest_patch(refs).version == "7.3b"


def test_sitemap_parsing_keeps_pt_br_link() -> None:
    xml = """<urlset><url><loc>https://wildrift.leagueoflegends.com/en-us/news/game-updates/wild-rift-patch-notes-7-3b/</loc>
    <lastmod>2026-10-14T09:00:00.000Z</lastmod>
    <xhtml:link rel="alternate" hreflang="pt-br" href="https://wildrift.leagueoflegends.com/pt-br/news/x/"/></url>
    <url><loc>https://wildrift.leagueoflegends.com/de-de/news/game-updates/wild-rift-patch-notes-7-3b/</loc></url></urlset>"""
    refs = parse_patch_notes_sitemap(xml)
    assert len(refs) == 1 and refs[0].version == "7.3b" and refs[0].url_pt.endswith("/pt-br/news/x/")


def page(blades: list) -> str:
    data = {"props": {"pageProps": {"page": {"blades": blades}}}}
    return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script>'


def test_champion_list_and_page() -> None:
    cards = parse_champion_list(
        page(
            [
                {
                    "type": "characterCardGrid",
                    "items": [
                        {
                            "title": "DR. MUNDO",
                            "media": {"url": "https://cmsassets.rgpub.io/a.jpg"},
                            "action": {"payload": {"url": "/pt-br/champions/dr-mundo/"}},
                        }
                    ],
                }
            ]
        )
    )
    assert cards[0].slug == "dr-mundo" and cards[0].title_upper == "DR. MUNDO"
    champ = parse_champion_page(
        page(
            [
                {
                    "type": "characterMasthead",
                    "title": "AMUMU",
                    "subtitle": "a Múmia Triste",
                    "role": {"roles": [{"id": "tank"}]},
                    "difficulty": {"value": 1},
                },
                {
                    "type": "iconTab",
                    "groups": [
                        {
                            "label": "Lançar Bandagens",
                            "thumbnail": {"url": "https://cmsassets.rgpub.io/q.jpg"},
                            "content": {"subtitle": "1", "description": {"body": "Causa <b>atordoamento</b>."}},
                        }
                    ],
                },
            ]
        ),
        "https://wildrift.leagueoflegends.com/pt-br/champions/amumu/",
    )
    assert champ.classes == ["tank"] and champ.difficulty == 1
    assert champ.abilities[0].slot == "1" and champ.abilities[0].description == "Causa atordoamento."
