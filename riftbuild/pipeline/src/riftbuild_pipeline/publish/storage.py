"""Publishing to Supabase (Storage + catalog_releases). Without credentials, everything is a dry run."""

import os
from dataclasses import dataclass

import httpx


@dataclass
class SupabaseTarget:
    url: str
    service_key: str

    @classmethod
    def from_env(cls) -> "SupabaseTarget | None":
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        return cls(url, key) if url and key else None

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.service_key}", "apikey": self.service_key, **(extra or {})}

    def public_url(self, bucket: str, path: str) -> str:
        return f"{self.url}/storage/v1/object/public/{bucket}/{path}"

    def upload(self, bucket: str, path: str, data: bytes, content_type: str, cache_control: str) -> None:
        resp = httpx.post(
            f"{self.url}/storage/v1/object/{bucket}/{path}",
            content=data,
            headers=self._headers(
                {"Content-Type": content_type, "x-upsert": "true", "Cache-Control": cache_control}
            ),
            timeout=60,
        )
        resp.raise_for_status()

    def exists(self, bucket: str, path: str) -> bool:
        resp = httpx.head(self.public_url(bucket, path), timeout=30)
        return resp.status_code == 200

    def insert(self, table: str, row: dict, upsert_on: str | None = None) -> None:
        prefer = "return=minimal"
        if upsert_on:
            prefer += ",resolution=merge-duplicates"
        url = f"{self.url}/rest/v1/{table}" + (f"?on_conflict={upsert_on}" if upsert_on else "")
        resp = httpx.post(url, json=row, headers=self._headers({"Prefer": prefer}), timeout=30)
        resp.raise_for_status()

    def rpc(self, fn: str, args: dict) -> object:
        resp = httpx.post(f"{self.url}/rest/v1/rpc/{fn}", json=args, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        return resp.json() if resp.content else None

    def select(self, table: str, query: str) -> list[dict]:
        resp = httpx.get(f"{self.url}/rest/v1/{table}?{query}", headers=self._headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()
