import httpx
import pytest
import respx

from riftbuild_pipeline.config import HttpConfig
from riftbuild_pipeline.http.client import PoliteClient, RequestBudgetExceededError, SourceDisallowedError

BASE = "https://www.riftpatchnotes.com"


def make_client(tmp_path, **cfg) -> tuple[PoliteClient, list[float]]:
    sleeps: list[float] = []
    client = PoliteClient(HttpConfig(**cfg), cache_dir=tmp_path, sleep=sleeps.append)
    return client, sleeps


@respx.mock
def test_disallowed_by_robots(tmp_path) -> None:
    respx.get(f"{BASE}/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nDisallow: /items\n")
    )
    client, _ = make_client(tmp_path)
    with pytest.raises(SourceDisallowedError):
        client.get(f"{BASE}/items")


@respx.mock
def test_server_error_on_robots_blocks_host(tmp_path) -> None:
    respx.get(f"{BASE}/robots.txt").mock(return_value=httpx.Response(503))
    route = respx.get(f"{BASE}/items").mock(return_value=httpx.Response(200, text="x"))
    client, _ = make_client(tmp_path)
    with pytest.raises(SourceDisallowedError):
        client.get(f"{BASE}/items")
    assert not route.called


@respx.mock
def test_cache_and_rate_limit(tmp_path) -> None:
    respx.get(f"{BASE}/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nAllow: /\n"))
    route = respx.get(f"{BASE}/items").mock(return_value=httpx.Response(200, text="hello"))
    respx.get(f"{BASE}/runes").mock(return_value=httpx.Response(200, text="runes"))
    client, sleeps = make_client(tmp_path, min_interval_s=2.0)
    assert client.get(f"{BASE}/items").text == "hello"
    again = client.get(f"{BASE}/items")
    assert again.from_cache and route.call_count == 1
    client.get(f"{BASE}/runes")
    assert any(s > 1.0 for s in sleeps), "second request to the same host must wait"


@respx.mock
def test_retries_on_429(tmp_path) -> None:
    respx.get(f"{BASE}/robots.txt").mock(return_value=httpx.Response(404))
    route = respx.get(f"{BASE}/items").mock(
        side_effect=[httpx.Response(429, headers={"retry-after": "1"}), httpx.Response(200, text="ok")]
    )
    client, _ = make_client(tmp_path, min_interval_s=0)
    assert client.get(f"{BASE}/items").text == "ok"
    assert route.call_count == 2


@respx.mock
def test_request_budget(tmp_path) -> None:
    respx.get(f"{BASE}/robots.txt").mock(return_value=httpx.Response(404))
    respx.get(url__regex=rf"{BASE}/p\d").mock(return_value=httpx.Response(200, text="x"))
    client, _ = make_client(tmp_path, min_interval_s=0, max_requests=2)
    client.get(f"{BASE}/p1")
    with pytest.raises(RequestBudgetExceededError):
        client.get(f"{BASE}/p2")
