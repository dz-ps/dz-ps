"""Escritor do pacote de rede .rvx (versão 1).

Especificação: packages/data-format/FORMATO.md. O pipeline é o único escritor;
o leitor fica em packages/data-format (TypeScript).

Layout:
    0   'RVX1'                      magic (4 bytes)
    4   u32 LE                      tamanho do cabeçalho JSON em bytes
    8   cabeçalho JSON (UTF-8)      + zeros até múltiplo de 8
    D   área de dados               seções alinhadas a 8 bytes, little-endian
"""

from __future__ import annotations

import json
import math
import os
import struct
import sys
from array import array
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .geo import distancia_m
from .gtfs import Feed

MAGIC = b"RVX1"
VERSAO = 1
TIPOS = {"f32": "f", "i32": "i", "u32": "I", "u16": "H", "u8": "B"}
DIAS_GTFS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# Caminhada offline (SPEC §3.5): linha reta × 1,3, rotulada como estimativa.
CAMINHADA_FATOR = 1.3
CAMINHADA_MS = 1.2
TRANSFERENCIA_RAIO_M = 400


def _alinhar(n: int, a: int = 8) -> int:
    return (n + a - 1) // a * a


@dataclass
class Padrao:
    linha: int
    pontos: list[int]
    viagens: list[tuple[int, list[int], list[int]]]  # (servico, chegadas, partidas)
    destino: str
    sentido: int


def _servico_tipo(route: dict[str, str]) -> str:
    """Tipo de serviço para cores e rótulos. Vem de route_desc quando é um valor conhecido."""
    desc = (route.get("route_desc") or "").strip().lower()
    if desc in {"troncal", "alimentadora", "aquaviario", "expresso", "municipal"}:
        return desc
    return "aquaviario" if route.get("route_type") == "4" else "outro"


def _montar_padroes(
    feed: Feed,
    idx_ponto: dict[str, int],
    idx_linha: dict[str, int],
    idx_servico: dict[str, int],
    nome_ponto: dict[str, str],
) -> list[Padrao]:
    grupos: dict[tuple[str, tuple[int, ...]], list[dict[str, str]]] = {}
    for t in feed.trips:
        st = feed.stop_times.get(t["trip_id"])
        if not st or len(st) < 2 or t["service_id"] not in idx_servico:
            continue
        seq = tuple(idx_ponto[s[1]] for s in st)
        grupos.setdefault((t["route_id"], seq), []).append(t)

    padroes: list[Padrao] = []
    for (route_id, seq), trips in sorted(grupos.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        linhas = []
        for t in trips:
            st = feed.stop_times[t["trip_id"]]
            linhas.append((idx_servico[t["service_id"]], [s[2] for s in st], [s[3] for s in st], t))
        linhas.sort(key=lambda v: (v[2][0], v[1][-1]))
        # FIFO: cada sub-padrão não pode ter ultrapassagem em nenhuma parada.
        subs: list[list[tuple[int, list[int], list[int], dict[str, str]]]] = []
        for v in linhas:
            for sub in subs:
                ult = sub[-1]
                if all(a >= b for a, b in zip(v[1], ult[1], strict=True)) and all(
                    a >= b for a, b in zip(v[2], ult[2], strict=True)
                ):
                    sub.append(v)
                    break
            else:
                subs.append([v])
        for sub in subs:
            t0 = sub[0][3]
            padroes.append(
                Padrao(
                    linha=idx_linha[route_id],
                    pontos=list(seq),
                    viagens=[(s, c, p) for s, c, p, _ in sub],
                    destino=t0.get("trip_headsign") or nome_ponto[feed.stop_times[t0["trip_id"]][-1][1]],
                    sentido=int(t0.get("direction_id") or 0),
                )
            )
    return padroes


def _agora() -> str:
    """Respeita SOURCE_DATE_EPOCH para builds reprodutíveis."""
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    dt = datetime.fromtimestamp(int(epoch), UTC) if epoch else datetime.now(UTC)
    return dt.replace(microsecond=0).isoformat()


def construir(
    feed: Feed,
    *,
    sintetica: bool,
    fonte: str,
    scoring: dict[str, Any] | None = None,
    lugares: list[dict[str, Any]] | None = None,
) -> bytes:
    pontos = sorted(feed.stops, key=lambda s: s["stop_id"])
    idx_ponto = {s["stop_id"]: i for i, s in enumerate(pontos)}
    nome_ponto = {s["stop_id"]: s["stop_name"] for s in pontos}
    rotas = sorted(feed.routes, key=lambda r: r["route_id"])
    idx_linha = {r["route_id"]: i for i, r in enumerate(rotas)}

    servicos: list[dict[str, Any]] = []
    for c in sorted(feed.calendar, key=lambda c: c["service_id"]):
        servicos.append(
            {
                "id": c["service_id"],
                "dias": [c[d] == "1" for d in DIAS_GTFS],
                "inicio": c["start_date"],
                "fim": c["end_date"],
                "add": [],
                "rem": [],
            }
        )
    idx_servico = {s["id"]: i for i, s in enumerate(servicos)}
    for cd in feed.calendar_dates:
        sid = cd["service_id"]
        if sid not in idx_servico:  # serviço só com calendar_dates
            idx_servico[sid] = len(servicos)
            servicos.append(
                {"id": sid, "dias": [False] * 7, "inicio": cd["date"], "fim": cd["date"], "add": [], "rem": []}
            )
        s = servicos[idx_servico[sid]]
        (s["add"] if cd["exception_type"] == "1" else s["rem"]).append(cd["date"])
        s["inicio"] = min(s["inicio"], cd["date"])
        s["fim"] = max(s["fim"], cd["date"])

    padroes = _montar_padroes(feed, idx_ponto, idx_linha, idx_servico, nome_ponto)

    sec: dict[str, tuple[str, array]] = {}

    def add(nome: str, tipo: str, valores: Any) -> None:
        sec[nome] = (tipo, array(TIPOS[tipo], valores))

    add("ponto_lat", "f32", (float(s["stop_lat"]) for s in pontos))
    add("ponto_lon", "f32", (float(s["stop_lon"]) for s in pontos))
    add("padrao_linha", "u32", (p.linha for p in padroes))

    pp_ini, pp, pv_ini, pt_ini, v_serv, cheg, part = [0], [], [0], [0], [], [], []
    for p in padroes:
        pp.extend(p.pontos)
        pp_ini.append(len(pp))
        for s, c, d in p.viagens:
            v_serv.append(s)
            cheg.extend(c)
            part.extend(d)
        pv_ini.append(len(v_serv))
        pt_ini.append(len(cheg))
    add("padrao_pontos_ini", "u32", pp_ini)
    add("padrao_pontos", "u32", pp)
    add("padrao_viagens_ini", "u32", pv_ini)
    add("padrao_tempos_ini", "u32", pt_ini)
    add("viagem_servico", "u16", v_serv)
    add("chegada", "i32", cheg)
    add("partida", "i32", part)

    por_ponto: list[list[tuple[int, int]]] = [[] for _ in pontos]
    for pi, p in enumerate(padroes):
        for pos, s in enumerate(p.pontos):
            por_ponto[s].append((pi, pos))
    add("ponto_padroes_ini", "u32", _prefixo(len(x) for x in por_ponto))
    add("ponto_padroes", "u32", (pi for x in por_ponto for pi, _ in x))
    add("ponto_padroes_pos", "u32", (pos for x in por_ponto for _, pos in x))

    transf = _transferencias([(float(s["stop_lat"]), float(s["stop_lon"])) for s in pontos])
    add("transf_ini", "u32", _prefixo(len(x) for x in transf))
    add("transf_para", "u32", (j for x in transf for j, _ in x))
    add("transf_s", "u16", (s for x in transf for _, s in x))

    linhas_meta = []
    for r in rotas:
        linhas_meta.append(
            {
                "id": r["route_id"],
                "curta": r.get("route_short_name", ""),
                "longa": r.get("route_long_name", ""),
                "tipo": int(r.get("route_type") or 3),
                "servico": _servico_tipo(r),
                "cor": ("#" + r["route_color"]) if r.get("route_color") else None,
            }
        )

    secoes_meta: dict[str, dict[str, Any]] = {}
    off = 0
    for nome, (tipo, arr) in sec.items():
        secoes_meta[nome] = {"tipo": tipo, "offset": off, "n": len(arr)}
        off = _alinhar(off + len(arr) * arr.itemsize)

    cab = {
        "formato": "rvx",
        "versao": VERSAO,
        "gerado_em": _agora(),
        "rede": {
            "nome": feed.feed_info.get("feed_publisher_name") or (feed.agency[0]["agency_name"] if feed.agency else ""),
            "sintetica": sintetica,
            "fonte": fonte,
            "versao_feed": feed.feed_info.get("feed_version", ""),
        },
        "fuso": feed.agency[0]["agency_timezone"] if feed.agency else "America/Sao_Paulo",
        "pontos": {"ids": [s["stop_id"] for s in pontos], "nomes": [s["stop_name"] for s in pontos]},
        "linhas": linhas_meta,
        "padroes": [{"linha": p.linha, "destino": p.destino, "sentido": p.sentido} for p in padroes],
        "servicos": servicos,
        "caminhada": {
            "metodo": "linha_reta",
            "fator": CAMINHADA_FATOR,
            "velocidade_ms": CAMINHADA_MS,
            "raio_transferencia_m": TRANSFERENCIA_RAIO_M,
            "estimativa": True,
        },
        "scoring": scoring or {},
        # Lugares para a busca offline (bairros, universidades, hospitais...). Só busca, não roteamento.
        "lugares": {
            "nomes": [x["nome"] for x in lugares or []],
            "tipos": [x["tipo"] for x in lugares or []],
            "lat": [round(x["lat"], 5) for x in lugares or []],
            "lon": [round(x["lon"], 5) for x in lugares or []],
        },
        "secoes": secoes_meta,
    }
    cab_bytes = json.dumps(cab, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    inicio_dados = _alinhar(8 + len(cab_bytes))
    out = bytearray(inicio_dados + off)
    out[0:4] = MAGIC
    out[4:8] = struct.pack("<I", len(cab_bytes))
    out[8 : 8 + len(cab_bytes)] = cab_bytes
    for nome, (_, arr) in sec.items():
        if sys.byteorder != "little":
            arr = array(arr.typecode, arr)
            arr.byteswap()
        o = inicio_dados + secoes_meta[nome]["offset"]
        b = arr.tobytes()
        out[o : o + len(b)] = b
    return bytes(out)


def _transferencias(coords: list[tuple[float, float]]) -> list[list[tuple[int, int]]]:
    """Pares de pontos a até TRANSFERENCIA_RAIO_M, com tempo a pé estimado (grade espacial)."""
    # Célula maior que o raio em lat e lon até ~25° de latitude (Grande Vitória ~20°).
    celula = TRANSFERENCIA_RAIO_M / 100_000
    grade: dict[tuple[int, int], list[int]] = {}
    for i, (la, lo) in enumerate(coords):
        grade.setdefault((int(la // celula), int(lo // celula)), []).append(i)
    res: list[list[tuple[int, int]]] = [[] for _ in coords]
    for i, (la, lo) in enumerate(coords):
        ci, cj = int(la // celula), int(lo // celula)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for j in grade.get((ci + di, cj + dj), ()):
                    if j == i:
                        continue
                    d = distancia_m(la, lo, *coords[j])
                    if d <= TRANSFERENCIA_RAIO_M:
                        res[i].append((j, math.ceil(d * CAMINHADA_FATOR / CAMINHADA_MS)))
        res[i].sort()
    return res


def _prefixo(contagens: Any) -> list[int]:
    r = [0]
    for c in contagens:
        r.append(r[-1] + c)
    return r


def ler_cabecalho(dados: bytes) -> dict[str, Any]:
    if dados[:4] != MAGIC:
        raise ValueError("não é um pacote .rvx")
    (n,) = struct.unpack("<I", dados[4:8])
    return json.loads(dados[8 : 8 + n])


def salvar(dados: bytes, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(dados)
