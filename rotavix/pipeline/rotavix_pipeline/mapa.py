"""Mapa offline: recorte PMTiles do build diário da Protomaps + fontes e sprites locais.

Fonte: https://build.protomaps.com (dados © colaboradores do OpenStreetMap, ODbL).
O recorte é feito com requisições HTTP Range, em baixa concorrência, e só baixa
os tiles da bbox pedida. Nada é processado no servidor de terceiros.
"""

from __future__ import annotations

import math
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from pmtiles.reader import Reader
from pmtiles.tile import zxy_to_tileid
from pmtiles.writer import Writer

BUILDS_URL = "https://build-metadata.protomaps.dev/builds.json"
BUILD_BASE = "https://build.protomaps.com/"
ASSETS_BASE = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/"

# Fontes usadas pelo estilo da Protomaps; faixas Unicode suficientes para português.
FONTES = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"]
FAIXAS = ["0-255", "256-511", "8192-8447"]
SPRITES = [f"{tema}{sufixo}.{ext}" for tema in ("light", "dark") for sufixo in ("", "@2x") for ext in ("json", "png")]


def user_agent() -> str:
    contato = os.environ.get("RV_CONTATO", "").strip()
    return "RotaVix-pipeline/0.1" + (f" (+{contato})" if contato else "")


def _cliente() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": user_agent()}, timeout=60, follow_redirects=True)


def build_mais_recente(cli: httpx.Client) -> str:
    builds = cli.get(BUILDS_URL).raise_for_status().json()
    return sorted(b["key"] for b in builds)[-1]


def _lon_x(lon: float, z: int) -> int:
    return int((lon + 180) / 360 * 2**z)


def _lat_y(lat: float, z: int) -> int:
    r = math.radians(lat)
    return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**z)


def tiles_na_bbox(bbox: tuple[float, float, float, float], zmin: int, zmax: int) -> list[tuple[int, int, int]]:
    oeste, sul, leste, norte = bbox
    res = []
    for z in range(zmin, zmax + 1):
        n = 2**z - 1
        x0, x1 = max(0, _lon_x(oeste, z)), min(n, _lon_x(leste, z))
        y0, y1 = max(0, _lat_y(norte, z)), min(n, _lat_y(sul, z))
        res += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    return res


def recortar(
    destino: Path,
    bbox: tuple[float, float, float, float],
    zmax: int = 14,
    build: str | None = None,
    concorrencia: int = 6,
) -> dict[str, object]:
    """Gera `destino` (.pmtiles) com os tiles z0..zmax da bbox (oeste, sul, leste, norte)."""
    with _cliente() as cli:
        build = build or build_mais_recente(cli)
        url = BUILD_BASE + build
        cache: dict[tuple[int, int], bytes] = {}
        trava = threading.Lock()
        limite_dirs = [0]

        def get_bytes(offset: int, length: int) -> bytes:
            chave = (offset, length)
            if chave in cache:
                return cache[chave]
            r = cli.get(url, headers={"Range": f"bytes={offset}-{offset + length - 1}"})
            if r.status_code != 206:
                raise RuntimeError(f"servidor não respondeu Range ({r.status_code})")
            dados = r.content
            if offset < limite_dirs[0] or limite_dirs[0] == 0:  # cabeçalho e diretórios
                with trava:
                    cache[chave] = dados
            return dados

        leitor = Reader(get_bytes)
        cab = leitor.header()
        limite_dirs[0] = cab["tile_data_offset"]
        meta = leitor.metadata()

        lista = tiles_na_bbox(bbox, 0, zmax)
        with ThreadPoolExecutor(concorrencia) as ex:
            dados = list(ex.map(lambda t: leitor.get(*t), lista))

    pares = sorted((zxy_to_tileid(*t), d) for t, d in zip(lista, dados, strict=True) if d)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("wb") as f:
        w = Writer(f)
        for tid, d in pares:
            w.write_tile(tid, d)
        oeste, sul, leste, norte = bbox
        cab_novo = {
            "tile_type": cab["tile_type"],
            "tile_compression": cab["tile_compression"],
            "min_lon_e7": int(oeste * 1e7),
            "min_lat_e7": int(sul * 1e7),
            "max_lon_e7": int(leste * 1e7),
            "max_lat_e7": int(norte * 1e7),
            "center_zoom": min(12, zmax),
            "center_lon_e7": int((oeste + leste) / 2 * 1e7),
            "center_lat_e7": int((sul + norte) / 2 * 1e7),
        }
        meta = {**meta, "rotavix": {"build": build, "bbox": list(bbox), "zmax": zmax}}
        w.finalize(cab_novo, meta)
    return {"build": build, "tiles": len(pares), "bytes": destino.stat().st_size}


def baixar_assets(destino: Path) -> int:
    """Fontes (glyphs) e sprites do estilo, para o mapa funcionar sem rede."""
    arquivos = [f"fonts/{fonte}/{faixa}.pbf" for fonte in FONTES for faixa in FAIXAS]
    arquivos += [f"sprites/v4/{s}" for s in SPRITES]
    total = 0
    with _cliente() as cli:
        for rel in arquivos:
            alvo = destino / rel
            if alvo.exists() and alvo.stat().st_size > 0:
                total += alvo.stat().st_size
                continue
            r = cli.get(ASSETS_BASE + rel.replace(" ", "%20")).raise_for_status()
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_bytes(r.content)
            total += len(r.content)
    return total
