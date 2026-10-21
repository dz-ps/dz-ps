import pytest

from riftbuild_pipeline.http.guard import ForbiddenSourceError, assert_allowed
from riftbuild_pipeline.http.robots import build_verdict


@pytest.mark.parametrize(
    "url",
    [
        "https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/1001.png",
        "https://raw.communitydragon.org/latest/x.png",
        "https://u.gg/lol/champions/amumu/build",
        "https://www.op.gg/champions/amumu",
        "https://www.riftpatchnotes.com/lol/items",
        "https://www.riftpatchnotes.com/lol",
        "https://wiki.leagueoflegends.com/en-us/Amumu",
        "https://wiki.leagueoflegends.com/en-us/api.php?action=query&titles=Amumu",
        "http://wildrift.leagueoflegends.com/en-us/",
        "https://example.com/",
    ],
)
def test_forbidden_sources_are_blocked(url: str) -> None:
    with pytest.raises(ForbiddenSourceError):
        assert_allowed(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://wildrift.leagueoflegends.com/en-us/champions/amumu/",
        "https://cmsassets.rgpub.io/sanity/images/x.jpg?accountingTag=WR",
        "https://www.riftpatchnotes.com/items",
        "https://www.riftpatchnotes.com/lolipop",  # not the /lol section
        "https://wiki.leagueoflegends.com/en-us/WR:Amumu",
        "https://wiki.leagueoflegends.com/en-us/Module:WRItemData/data",
        "https://wiki.leagueoflegends.com/robots.txt",
    ],
)
def test_wild_rift_sources_are_allowed(url: str) -> None:
    assert_allowed(url)


def test_robots_5xx_means_disallow_everything() -> None:
    verdict = build_verdict("wiki.leagueoflegends.com", 502, "Server maintenance", "2026-10-21T00:00:00Z")
    assert verdict.status == "unreachable"
    assert not verdict.allows("https://wiki.leagueoflegends.com/en-us/WR:Amumu")


def test_robots_network_error_means_disallow() -> None:
    assert not build_verdict("h", None, "timeout", "t").allows("https://h/x")


def test_robots_4xx_means_no_restrictions() -> None:
    assert build_verdict("h", 404, "", "t").allows("https://h/anything")


def test_robots_rules_are_obeyed() -> None:
    body = "User-agent: *\nDisallow: /private\n"
    verdict = build_verdict("h", 200, body, "t")
    assert verdict.allows("https://h/public")
    assert not verdict.allows("https://h/private/x")
