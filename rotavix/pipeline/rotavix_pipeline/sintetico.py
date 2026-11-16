"""Gera o GTFS da REDE SINTÉTICA DE TESTE a partir de fixtures/sintetico/rede.yaml.

Nada aqui é dado real: serve só para desenvolvimento e testes da Fase 0.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import yaml

from .geo import distancia_m

DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
FATOR_ROTA = 1.3  # distância em linha reta × 1,3 (mesma regra da caminhada offline)


def _hhmm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 3600 + int(m) * 60


def _fmt(seg: int) -> str:
    return f"{seg // 3600:02d}:{seg % 3600 // 60:02d}:{seg % 60:02d}"


def _escrever(pasta: Path, nome: str, campos: list[str], linhas: list[dict[str, Any]]) -> None:
    with (pasta / nome).open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos, lineterminator="\n")
        w.writeheader()
        w.writerows(linhas)


def gerar(rede_yaml: Path, saida: Path) -> None:
    cfg = yaml.safe_load(rede_yaml.read_text(encoding="utf-8"))
    saida.mkdir(parents=True, exist_ok=True)
    rede = cfg["rede"]
    pontos: dict[str, list[Any]] = cfg["pontos"]
    parada_s = int(cfg.get("parada_s", 0))

    _escrever(
        saida,
        "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [
            {
                "agency_id": "SINT",
                "agency_name": rede["agencia"],
                "agency_url": "https://example.org/rotavix-sintetico",
                "agency_timezone": rede["fuso"],
                "agency_lang": "pt",
            },
        ],
    )
    inicio = rede["vigencia"]["inicio"].replace("-", "")
    fim = rede["vigencia"]["fim"].replace("-", "")
    _escrever(
        saida,
        "feed_info.txt",
        ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_start_date", "feed_end_date", "feed_version"],
        [
            {
                "feed_publisher_name": "RotaVix (rede sintética de teste)",
                "feed_publisher_url": "https://example.org/rotavix-sintetico",
                "feed_lang": "pt",
                "feed_start_date": inicio,
                "feed_end_date": fim,
                "feed_version": "sintetico-1",
            },
        ],
    )
    _escrever(
        saida,
        "stops.txt",
        ["stop_id", "stop_name", "stop_desc", "stop_lat", "stop_lon", "location_type"],
        [
            {
                "stop_id": pid,
                "stop_name": nome,
                "stop_desc": "Ponto fictício (rede sintética de teste)",
                "stop_lat": f"{lat:.6f}",
                "stop_lon": f"{lon:.6f}",
                "location_type": 0,
            }
            for pid, (nome, lat, lon) in pontos.items()
        ],
    )
    _escrever(
        saida,
        "routes.txt",
        ["route_id", "agency_id", "route_short_name", "route_long_name", "route_desc", "route_type"],
        [
            {
                "route_id": ln["id"],
                "agency_id": "SINT",
                "route_short_name": ln["id"],
                "route_long_name": ln["longa"],
                "route_desc": ln["servico"],
                "route_type": ln["tipo"],
            }
            for ln in cfg["linhas"]
        ],
    )

    cal = cfg["calendario"]
    servicos = {k: v for k, v in cal.items() if k != "excecoes"}
    _escrever(
        saida,
        "calendar.txt",
        [
            "service_id",
            *["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            "start_date",
            "end_date",
        ],
        [
            {
                "service_id": sid,
                **{
                    en: int(pt in s["dias"])
                    for pt, en in zip(
                        DIAS,
                        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                        strict=True,
                    )
                },
                "start_date": inicio,
                "end_date": fim,
            }
            for sid, s in servicos.items()
        ],
    )
    datas = []
    for exc in cal.get("excecoes", []):
        d = exc["data"].replace("-", "")
        if exc.get("remove"):
            datas.append({"service_id": exc["remove"], "date": d, "exception_type": 2})
        if exc.get("adiciona"):
            datas.append({"service_id": exc["adiciona"], "date": d, "exception_type": 1})
    _escrever(saida, "calendar_dates.txt", ["service_id", "date", "exception_type"], datas)

    trips: list[dict[str, Any]] = []
    stop_times: list[dict[str, Any]] = []
    for ln in cfg["linhas"]:
        v_ms = ln["velocidade_kmh"] / 3.6
        for direcao, seq in enumerate([ln["pontos"], list(reversed(ln["pontos"]))]):
            # Tempo acumulado de cada parada desde a partida, arredondado ao minuto.
            acum = [0]
            for a, b in zip(seq, seq[1:], strict=False):
                pa, pb = pontos[a], pontos[b]
                d = distancia_m(pa[1], pa[2], pb[1], pb[2]) * FATOR_ROTA
                acum.append(acum[-1] + max(60, round(d / v_ms / 60) * 60) + parada_s)
            for sid, s in servicos.items():
                passo = int(round(ln["intervalo_min"] * s["fator_intervalo"])) * 60
                t = _hhmm(ln["inicio"])
                while t <= _hhmm(ln["fim"]):
                    tid = f"{ln['id']}-{direcao}-{sid}-{_fmt(t)[:5].replace(':', '')}"
                    trips.append(
                        {
                            "route_id": ln["id"],
                            "service_id": sid,
                            "trip_id": tid,
                            "trip_headsign": pontos[seq[-1]][0],
                            "direction_id": direcao,
                        }
                    )
                    for i, (pid, dt) in enumerate(zip(seq, acum, strict=True)):
                        chegada = t + dt - (parada_s if i > 0 else 0)
                        partida = t + dt
                        stop_times.append(
                            {
                                "trip_id": tid,
                                "arrival_time": _fmt(chegada),
                                "departure_time": _fmt(partida),
                                "stop_id": pid,
                                "stop_sequence": i + 1,
                                "timepoint": 1 if i == 0 else 0,
                            }
                        )
                    t += passo
    _escrever(saida, "trips.txt", ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], trips)
    _escrever(
        saida,
        "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "timepoint"],
        stop_times,
    )
