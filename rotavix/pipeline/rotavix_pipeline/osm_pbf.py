"""Extrai do PBF do OpenStreetMap (ODbL) as rotas do Transcol e os lugares para a busca.

Fonte do extrato: download.openstreetmap.fr (Espírito Santo). Duas passadas:
1) relações de rota de ônibus da rede Transcol;
2) nós (pontos, com coordenadas) e vias (geometria) usados por essas relações + lugares nomeados.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import osmium

# Grande Vitória (Fundão a Guarapari)
OESTE, SUL, LESTE, NORTE = -40.75, -20.85, -39.95, -19.80

LUGAR_TAGS = {
    "place": {"suburb", "neighbourhood", "quarter", "town", "village", "city"},
    "amenity": {
        "university",
        "college",
        "hospital",
        "bus_station",
        "ferry_terminal",
        "townhall",
        "library",
        "marketplace",
    },
    "shop": {"mall"},
    "aeroway": {"aerodrome"},
    "leisure": {"stadium", "park"},
    "tourism": {"attraction", "museum"},
    "public_transport": {"station"},
}


def _na_regiao(lat: float, lon: float) -> bool:
    return SUL <= lat <= NORTE and OESTE <= lon <= LESTE


def _tipo_lugar(tags: Any) -> str | None:
    for k, valores in LUGAR_TAGS.items():
        v = tags.get(k)
        if v in valores:
            return f"{k}={v}"
    return None


class _Relacoes(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.rotas: list[dict[str, Any]] = []

    def relation(self, r: Any) -> None:
        t = r.tags
        if t.get("type") != "route" or t.get("route") not in ("bus", "ferry"):
            return
        # Todas as redes de ônibus da região: linhas municipais integradas ao Transcol (ex.: Vitória)
        # ainda aparecem no OSM com a rede antiga. O cruzamento com a Ceturb exige número E nome parecidos.
        self.rotas.append(
            {
                "id": r.id,
                "tags": dict(t),
                "membros": [{"tipo": m.type, "ref": m.ref, "papel": m.role} for m in r.members],
            }
        )


@dataclass
class _Coletor(osmium.SimpleHandler):
    nos_alvo: set[int]
    vias_alvo: set[int]
    nos: dict[int, dict[str, Any]] = field(default_factory=dict)
    vias: dict[int, list[list[float]]] = field(default_factory=dict)
    nomes_vias: dict[int, str] = field(default_factory=dict)
    lugares: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        super().__init__()

    def node(self, n: Any) -> None:
        if not n.location.valid():
            return
        lat, lon = n.location.lat, n.location.lon
        if n.id in self.nos_alvo:
            self.nos[n.id] = {"lat": lat, "lon": lon, "tags": dict(n.tags)}
        tipo = _tipo_lugar(n.tags)
        if tipo and n.tags.get("name") and _na_regiao(lat, lon):
            self.lugares.append({"nome": n.tags["name"], "tipo": tipo, "lat": lat, "lon": lon, "osm": f"n{n.id}"})

    def way(self, w: Any) -> None:
        coords = None
        if w.id in self.vias_alvo:
            coords = [[nd.lon, nd.lat] for nd in w.nodes if nd.location.valid()]
            self.vias[w.id] = coords
            nome = w.tags.get("name")
            if nome:
                self.nomes_vias[w.id] = nome
        tipo = _tipo_lugar(w.tags)
        if tipo and w.tags.get("name"):
            pts = coords or [[nd.lon, nd.lat] for nd in w.nodes if nd.location.valid()]
            if pts:
                lon = sum(p[0] for p in pts) / len(pts)
                lat = sum(p[1] for p in pts) / len(pts)
                if _na_regiao(lat, lon):
                    self.lugares.append(
                        {"nome": w.tags["name"], "tipo": tipo, "lat": lat, "lon": lon, "osm": f"w{w.id}"}
                    )


def extrair(pbf: Path, saida: Path) -> dict[str, int]:
    rel = _Relacoes()
    rel.apply_file(str(pbf))
    nos = {m["ref"] for r in rel.rotas for m in r["membros"] if m["tipo"] == "n"}
    vias = {m["ref"] for r in rel.rotas for m in r["membros"] if m["tipo"] == "w"}
    col = _Coletor(nos, vias)
    col.apply_file(str(pbf), locations=True)
    # Só rotas que tocam a Grande Vitória.
    rotas = []
    for r in rel.rotas:
        pts = [col.nos[m["ref"]] for m in r["membros"] if m["tipo"] == "n" and m["ref"] in col.nos]
        if any(_na_regiao(p["lat"], p["lon"]) for p in pts):
            rotas.append(r)
    saida.parent.mkdir(parents=True, exist_ok=True)
    dados = {
        "fonte": "OpenStreetMap (ODbL), extrato download.openstreetmap.fr",
        "rotas": rotas,
        "nos": {str(k): v for k, v in col.nos.items()},
        "vias": {str(k): v for k, v in col.vias.items()},
        "nomes_vias": {str(k): v for k, v in col.nomes_vias.items()},
        "lugares": col.lugares,
    }
    saida.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    return {"rotas": len(rotas), "nos": len(col.nos), "vias": len(col.vias), "lugares": len(col.lugares)}
