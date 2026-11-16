"""Leitura mínima de GTFS estático (só o que o pacote .rvx precisa)."""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path


def _ler(pasta: Path, nome: str, obrigatorio: bool = True) -> list[dict[str, str]]:
    arq = pasta / nome
    if not arq.exists():
        if obrigatorio:
            raise FileNotFoundError(arq)
        return []
    with arq.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def hms(s: str) -> int:
    """'25:10:00' -> segundos desde a meia-noite do dia de serviço (pode passar de 24 h)."""
    h, m, sec = s.strip().split(":")
    return int(h) * 3600 + int(m) * 60 + int(sec)


@dataclass
class Feed:
    stops: list[dict[str, str]]
    routes: list[dict[str, str]]
    trips: list[dict[str, str]]
    stop_times: dict[str, list[tuple[int, str, int, int]]]  # trip -> [(seq, stop, chegada, partida)]
    calendar: list[dict[str, str]]
    calendar_dates: list[dict[str, str]]
    feed_info: dict[str, str] = field(default_factory=dict)
    agency: list[dict[str, str]] = field(default_factory=list)


def carregar(pasta: Path) -> Feed:
    st: dict[str, list[tuple[int, str, int, int]]] = {}
    for r in _ler(pasta, "stop_times.txt"):
        chegada = hms(r["arrival_time"]) if r.get("arrival_time") else None
        partida = hms(r["departure_time"]) if r.get("departure_time") else None
        if chegada is None or partida is None:
            raise ValueError(f"stop_times sem horário (interpolação ainda não suportada): {r['trip_id']}")
        st.setdefault(r["trip_id"], []).append((int(r["stop_sequence"]), r["stop_id"], chegada, partida))
    for lst in st.values():
        lst.sort()
    info = _ler(pasta, "feed_info.txt", obrigatorio=False)
    return Feed(
        stops=[s for s in _ler(pasta, "stops.txt") if s.get("location_type", "0") in ("", "0")],
        routes=_ler(pasta, "routes.txt"),
        trips=_ler(pasta, "trips.txt"),
        stop_times=st,
        calendar=_ler(pasta, "calendar.txt", obrigatorio=False),
        calendar_dates=_ler(pasta, "calendar_dates.txt", obrigatorio=False),
        feed_info=info[0] if info else {},
        agency=_ler(pasta, "agency.txt"),
    )
