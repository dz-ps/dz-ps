"""Polite HTTP client: allowlist guard, robots.txt gate, per-host rate limit, retries, disk cache."""

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx

from ..config import CACHE_DIR, USER_AGENT, HttpConfig
from .guard import assert_allowed
from .robots import RobotsVerdict, build_verdict, robots_url


class SourceDisallowedError(RuntimeError):
    """robots.txt (or its absence due to a server error) forbids fetching this URL in this run."""


class RequestBudgetExceededError(RuntimeError):
    pass


@dataclass
class Response:
    url: str
    status: int
    text: str
    content: bytes
    fetched_at: str
    from_cache: bool
    headers: dict[str, str]

    def json(self) -> object:
        return json.loads(self.text)


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class PoliteClient:
    def __init__(
        self,
        config: HttpConfig | None = None,
        cache_dir: Path = CACHE_DIR / "raw",
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        use_cache: bool = True,
    ) -> None:
        self.config = config or HttpConfig()
        self.cache_dir = cache_dir
        self.use_cache = use_cache
        self._sleep = sleep
        self._last_request: dict[str, float] = {}
        self._robots: dict[str, RobotsVerdict] = {}
        self.requests_made = 0
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"},
            timeout=self.config.timeout_s,
            follow_redirects=False,
            transport=transport,
        )

    # -- public -----------------------------------------------------------------------------------
    def robots(self, url: str) -> RobotsVerdict:
        host = urlparse(url).netloc
        if host not in self._robots:
            r_url = robots_url(url)
            assert_allowed(r_url)
            try:
                resp = self._request(r_url)
                verdict = build_verdict(host, resp.status_code, resp.text, now_iso())
            except httpx.HTTPError as exc:
                verdict = build_verdict(host, None, str(exc), now_iso())
            self._robots[host] = verdict
        return self._robots[host]

    def robots_verdicts(self) -> list[RobotsVerdict]:
        return list(self._robots.values())

    def get(self, url: str, *, max_age_s: int | None = None, binary: bool = False) -> Response:
        assert_allowed(url)
        verdict = self.robots(url)
        if not verdict.allows(url):
            raise SourceDisallowedError(
                f"robots.txt ({verdict.status}, HTTP {verdict.http_status}) disallows {url}"
            )

        cached = self._read_cache(url)
        ttl = self.config.cache_ttl_s if max_age_s is None else max_age_s
        if cached and self.use_cache and cached["age_s"] <= ttl:
            return self._cached_response(url, cached)

        headers = {}
        if cached and cached["meta"].get("etag"):
            headers["If-None-Match"] = cached["meta"]["etag"]
        if cached and cached["meta"].get("last_modified"):
            headers["If-Modified-Since"] = cached["meta"]["last_modified"]

        resp = self._request(url, headers=headers)
        if resp.status_code == 304 and cached:
            self._touch_cache(url, cached["meta"])
            return self._cached_response(url, cached)
        if resp.is_redirect:
            location = resp.headers.get("location", "")
            target = str(httpx.URL(url).join(location))
            return self.get(target, max_age_s=max_age_s, binary=binary)
        if resp.status_code >= 400:
            raise httpx.HTTPStatusError(f"HTTP {resp.status_code} for {url}", request=resp.request, response=resp)
        fetched_at = now_iso()
        self._write_cache(url, resp, fetched_at)
        return Response(
            url=url,
            status=resp.status_code,
            text="" if binary else resp.text,
            content=resp.content,
            fetched_at=fetched_at,
            from_cache=False,
            headers=dict(resp.headers),
        )

    def close(self) -> None:
        self._http.close()

    # -- internals --------------------------------------------------------------------------------
    def _request(self, url: str, headers: dict[str, str] | None = None) -> httpx.Response:
        host = urlparse(url).netloc
        attempt = 0
        while True:
            if self.requests_made >= self.config.max_requests:
                raise RequestBudgetExceededError(f"request budget of {self.config.max_requests} exhausted")
            interval = self.config.interval_for(url)
            wait = interval - (time.monotonic() - self._last_request.get(host, -1e9))
            if wait > 0:
                self._sleep(wait)
            self._last_request[host] = time.monotonic()
            self.requests_made += 1
            resp = self._http.get(url, headers=headers or {})
            retryable = resp.status_code == 429 or 500 <= resp.status_code < 600
            if not retryable or attempt >= self.config.max_retries or url.endswith("/robots.txt"):
                return resp
            attempt += 1
            retry_after = resp.headers.get("retry-after", "")
            delay = float(retry_after) if retry_after.isdigit() else 2.0 * 2**attempt
            self._sleep(min(delay, 60.0))

    def _paths(self, url: str) -> tuple[Path, Path]:
        host = urlparse(url).netloc
        key = hashlib.sha1(url.encode()).hexdigest()
        base = self.cache_dir / host / key
        return base.with_suffix(".body"), base.with_suffix(".meta.json")

    def _read_cache(self, url: str) -> dict | None:
        body_path, meta_path = self._paths(url)
        if not body_path.exists() or not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text())
        age = time.time() - meta.get("stored_epoch", 0)
        return {"meta": meta, "body": body_path.read_bytes(), "age_s": age}

    def _write_cache(self, url: str, resp: httpx.Response, fetched_at: str) -> None:
        body_path, meta_path = self._paths(url)
        body_path.parent.mkdir(parents=True, exist_ok=True)
        body_path.write_bytes(resp.content)
        meta = {
            "url": url,
            "status": resp.status_code,
            "fetched_at": fetched_at,
            "stored_epoch": time.time(),
            "etag": resp.headers.get("etag"),
            "last_modified": resp.headers.get("last-modified"),
            "content_type": resp.headers.get("content-type"),
        }
        meta_path.write_text(json.dumps(meta, indent=2))

    def _touch_cache(self, url: str, meta: dict) -> None:
        _, meta_path = self._paths(url)
        meta["stored_epoch"] = time.time()
        meta_path.write_text(json.dumps(meta, indent=2))

    def _cached_response(self, url: str, cached: dict) -> Response:
        body: bytes = cached["body"]
        return Response(
            url=url,
            status=cached["meta"]["status"],
            text=body.decode("utf-8", errors="replace"),
            content=body,
            fetched_at=cached["meta"]["fetched_at"],
            from_cache=True,
            headers={"content-type": cached["meta"].get("content_type") or ""},
        )
