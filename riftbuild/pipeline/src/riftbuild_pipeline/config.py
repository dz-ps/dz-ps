"""Pipeline configuration."""

import os
from dataclasses import dataclass
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PIPELINE_ROOT.parent
DATA_DIR = PIPELINE_ROOT / "data"
OUT_DIR = PIPELINE_ROOT / "out"
CACHE_DIR = PIPELINE_ROOT / ".cache"

USER_AGENT = "RiftBuildPipeline/0.1 (+https://github.com/dz-ps/riftbuild; fan project, Wild Rift data only)"
GAME = "wild_rift"


@dataclass(frozen=True)
class HttpConfig:
    min_interval_s: float = float(os.environ.get("RIFTBUILD_MIN_INTERVAL_S", "2.0"))
    max_requests: int = int(os.environ.get("RIFTBUILD_MAX_REQUESTS", "400"))
    timeout_s: float = 30.0
    max_retries: int = 3
    cache_ttl_s: int = int(os.environ.get("RIFTBUILD_CACHE_TTL_S", str(6 * 3600)))
    # Static images are cheap for the origin (CDN-served), so they use a shorter interval than pages.
    image_interval_s: float = float(os.environ.get("RIFTBUILD_IMAGE_INTERVAL_S", "0.5"))
    cdn_interval_s: float = 0.25

    def interval_for(self, url: str) -> float:
        if "cmsassets.rgpub.io" in url:
            return self.cdn_interval_s
        if url.split("?", 1)[0].lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            return self.image_interval_s
        return self.min_interval_s


OFFICIAL_BASE = "https://wildrift.leagueoflegends.com"
WIKI_BASE = "https://wiki.leagueoflegends.com"
RPN_BASE = "https://www.riftpatchnotes.com"
