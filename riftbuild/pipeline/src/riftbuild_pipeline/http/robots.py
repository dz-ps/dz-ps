"""robots.txt handling per RFC 9309.

- 2xx: parse and obey.
- 4xx: no restrictions (the file does not exist).
- 5xx / network error: treat the whole host as DISALLOWED for this run.
"""

from dataclasses import dataclass, field
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

USER_AGENT_TOKEN = "RiftBuildPipeline"


@dataclass
class RobotsVerdict:
    host: str
    status: str  # "parsed" | "missing" | "unreachable"
    http_status: int | None
    fetched_at: str
    body_excerpt: str = ""
    parser: RobotFileParser | None = field(default=None, repr=False)

    def allows(self, url: str) -> bool:
        if self.status == "unreachable":
            return False
        if self.status == "missing" or self.parser is None:
            return True
        return self.parser.can_fetch(USER_AGENT_TOKEN, url)


def build_verdict(host: str, http_status: int | None, body: str, fetched_at: str) -> RobotsVerdict:
    if http_status is None or http_status >= 500:
        return RobotsVerdict(host, "unreachable", http_status, fetched_at, body[:300])
    if 400 <= http_status < 500:
        return RobotsVerdict(host, "missing", http_status, fetched_at, body[:300])
    parser = RobotFileParser()
    parser.parse(body.splitlines())
    return RobotsVerdict(host, "parsed", http_status, fetched_at, body[:600], parser)


def robots_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/robots.txt"
