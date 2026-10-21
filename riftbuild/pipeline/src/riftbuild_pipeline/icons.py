"""Icons: downloaded once per patch from allowed Wild Rift sources, normalized to 128px WebP and named by
content hash (DECISIONS.md D13). The app never hotlinks third-party sites."""

import hashlib
import io
import json
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from .http.client import PoliteClient

SIZE = 128


@dataclass
class IconStore:
    out_dir: Path
    index: dict[str, dict] = field(default_factory=dict)  # filename -> {source_url, collected_at}
    failures: list[str] = field(default_factory=list)
    _by_url: dict[str, str] = field(default_factory=dict)

    def fetch(self, client: PoliteClient, url: str | None, *, crop_top_square: bool = False) -> str | None:
        if not url:
            return None
        if url in self._by_url:
            return self._by_url[url]
        try:
            resp = client.get(url, binary=True, max_age_s=30 * 86400)
            name = self.store(resp.content, crop_top_square=crop_top_square)
        except Exception as exc:
            self.failures.append(f"{url}: {exc}")
            return None
        self.index[name] = {"source_url": url, "collected_at": resp.fetched_at}
        self._by_url[url] = name
        return name

    def store(self, data: bytes, *, crop_top_square: bool = False) -> str:
        image = Image.open(io.BytesIO(data))
        image.load()
        image = image.convert("RGBA")
        width, height = image.size
        if crop_top_square and height > width:
            image = image.crop((0, 0, width, width))
        elif width != height:
            side = min(width, height)
            left, top = (width - side) // 2, (height - side) // 2
            image = image.crop((left, top, left + side, top + side))
        image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=85, method=6)
        out = buffer.getvalue()
        name = f"{hashlib.sha256(out).hexdigest()}.webp"
        self.out_dir.mkdir(parents=True, exist_ok=True)
        path = self.out_dir / name
        if not path.exists():
            path.write_bytes(out)
        return name

    def write_index(self) -> None:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        (self.out_dir / "index.json").write_text(json.dumps(self.index, indent=1, sort_keys=True))
