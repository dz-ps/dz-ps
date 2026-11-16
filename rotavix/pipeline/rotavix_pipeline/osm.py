"""Dados do OpenStreetMap via Overpass (ODbL): rotas de ônibus PTv2 e lugares para a busca.

Uso de baixa frequência (uma consulta por tipo, com cache em data/osm/). Atribuição:
"© colaboradores do OpenStreetMap".
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx

# Instâncias públicas, na ordem de preferência. Respeitar as políticas de uso de cada uma.
OVERPASS = [
    os.environ.get("RV_OVERPASS", ""),
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# Grande Vitória (Fundão a Guarapari): sul, oeste, norte, leste
BBOX = (-20.85, -40.75, -19.80, -39.95)

Q_RELACOES = """[out:json][timeout:300];
relation["type"="route"]["route"~"^(bus|ferry)$"]["network"="Transcol"]({s},{w},{n},{e});
out body;"""

Q_NOS_E_VIAS = """[out:json][timeout:300];
relation(id:{ids})->.r;
node(r.r);
out body;
way(r.r);
out geom;"""

# Lugares que as pessoas procuram pelo nome (busca offline).
Q_LUGARES = """[out:json][timeout:300];
(
  node["place"~"^(suburb|neighbourhood|quarter|town|village|city)$"]["name"]({s},{w},{n},{e});
  nwr["amenity"~"^(university|college|hospital|bus_station|ferry_terminal|townhall|courthouse|library|marketplace)$"]["name"]({s},{w},{n},{e});
  nwr["shop"="mall"]["name"]({s},{w},{n},{e});
  nwr["aeroway"="aerodrome"]["name"]({s},{w},{n},{e});
  nwr["leisure"~"^(stadium|park)$"]["name"]({s},{w},{n},{e});
  nwr["tourism"~"^(attraction|museum)$"]["name"]({s},{w},{n},{e});
  nwr["public_transport"="station"]["name"]({s},{w},{n},{e});
);
out center tags;"""


def _consultar(q: str) -> dict[str, Any]:
    erros = []
    for url in [u for u in OVERPASS if u]:
        try:
            r = httpx.post(url, data={"data": q}, timeout=900, headers={"User-Agent": "RotaVix-pipeline/0.1"})
            r.raise_for_status()
            return r.json()
        except Exception as e:  # tenta a próxima instância
            erros.append(f"{url}: {e}")
    raise RuntimeError("Overpass indisponível: " + " | ".join(erros))


def baixar(pasta: Path, *, refazer: bool = False, lote: int = 40) -> dict[str, Path]:
    """Baixa em partes pequenas (as instâncias públicas recusam consultas grandes)."""
    pasta.mkdir(parents=True, exist_ok=True)
    s, w, n, e = BBOX
    bb = {"s": s, "w": w, "n": n, "e": e}
    saidas: dict[str, Path] = {}

    arq = pasta / "lugares.json"
    if refazer or not arq.exists():
        arq.write_text(json.dumps(_consultar(Q_LUGARES.format(**bb))), encoding="utf-8")
    saidas["lugares"] = arq

    arq = pasta / "rotas.json"
    if refazer or not arq.exists():
        rels = _consultar(Q_RELACOES.format(**bb))["elements"]
        elementos: dict[tuple[str, int], dict[str, Any]] = {("relation", r["id"]): r for r in rels}
        ids = [r["id"] for r in rels]
        for i in range(0, len(ids), lote):
            parte = _consultar(Q_NOS_E_VIAS.format(ids=",".join(map(str, ids[i : i + lote]))))
            for el in parte["elements"]:
                elementos[(el["type"], el["id"])] = el
        arq.write_text(json.dumps({"elements": list(elementos.values())}), encoding="utf-8")
    saidas["rotas"] = arq
    return saidas
