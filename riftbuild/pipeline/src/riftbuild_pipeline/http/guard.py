"""Golden rule (spec §2): only Wild Rift sources. Every outgoing request goes through assert_allowed()."""

from urllib.parse import unquote, urlparse

# Hosts that serve League of Legends PC data. Never fetch from these, for any purpose.
FORBIDDEN_HOSTS = (
    "ddragon.leagueoflegends.com",
    "raw.communitydragon.org",
    "cdn.communitydragon.org",
    "communitydragon.org",
    "u.gg",
    "op.gg",
    "mobalytics.gg",
    "lolalytics.com",
    "leagueofgraphs.com",
    "metasrc.com",
    "blitz.gg",
    "porofessor.gg",
)

ALLOWED_HOSTS = (
    "wildrift.leagueoflegends.com",
    "cmsassets.rgpub.io",  # Riot CMS assets referenced by the official Wild Rift site
    "wiki.leagueoflegends.com",
    "www.riftpatchnotes.com",
    "riftpatchnotes.com",
)


class ForbiddenSourceError(RuntimeError):
    """Raised when code tries to reach a non-Wild-Rift source."""


def _host_matches(host: str, pattern: str) -> bool:
    return host == pattern or host.endswith("." + pattern)


def assert_allowed(url: str) -> None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        raise ForbiddenSourceError(f"only https is allowed: {url}")
    if any(_host_matches(host, bad) for bad in FORBIDDEN_HOSTS):
        raise ForbiddenSourceError(f"LoL PC source is forbidden: {url}")
    if not any(_host_matches(host, ok) for ok in ALLOWED_HOSTS):
        raise ForbiddenSourceError(f"host is not on the Wild Rift allowlist: {url}")
    path = unquote(parsed.path)
    if host.endswith("riftpatchnotes.com") and (path == "/lol" or path.startswith("/lol/")):
        raise ForbiddenSourceError(f"riftpatchnotes /lol is the PC section: {url}")
    if host == "wiki.leagueoflegends.com":
        _assert_wiki_wr(url, path, parsed.query)


def _assert_wiki_wr(url: str, path: str, query: str) -> None:
    """Wiki requests must target Wild Rift pages ("WR:" / "Module:WR") or WR files."""
    allowed_prefixes = ("WR:", "Module:WR", "File:WR", "Category:Wild_Rift", "Template:WR")
    if path in ("/robots.txt",):
        return
    if path.startswith("/en-us/") and not path.startswith("/en-us/api.php"):
        title = path.removeprefix("/en-us/")
        if title.startswith(allowed_prefixes):
            return
        raise ForbiddenSourceError(f"wiki page is not a Wild Rift page: {url}")
    if path.startswith("/en-us/api.php"):
        lowered = unquote(query)
        markers = ("WR:", "Module:WR", "File:WR", "prefix=WR", "apprefix=WR", "Wild_Rift", "Wild Rift")
        if any(marker in lowered for marker in markers):
            return
        raise ForbiddenSourceError(f"wiki API query does not target Wild Rift pages: {url}")
    if path.startswith("/en-us/images/"):
        # Image files are allowed only when discovered from WR pages; callers record provenance.
        return
    raise ForbiddenSourceError(f"unexpected wiki path: {url}")
