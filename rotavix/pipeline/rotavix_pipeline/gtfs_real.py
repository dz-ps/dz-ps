"""Monta o GTFS da rede real a partir de:

- Ceturb (portal público de horários): linhas, sentidos e horários OFICIAIS de partida por dia;
- OpenStreetMap (ODbL): sequência de pontos e traçado de cada linha.

Regras (SPEC §0.5 e §3.1):
- nada é inventado: linha sem rota correspondente no OSM fica fora do roteamento e vai para o relatório;
- a passagem nos pontos intermediários é ESTIMADA (timepoint=0) a partir da distância no traçado e de
  velocidades médias por faixa horária em config/velocidades.yaml (a calibrar com dados reais);
- feriados usam o quadro definido em config/calendario.yaml.
"""

from __future__ import annotations

import csv
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import holidays
import yaml

from .geo import distancia_m

DIAS_CETURB = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
PAPEIS_PARADA = ("stop", "stop_entry_only", "stop_exit_only")
PAPEIS_PLATAFORMA = ("platform", "platform_entry_only", "platform_exit_only")
GENERICAS = {"terminal", "via", "de", "da", "do", "das", "dos", "e", "a", "o", "t", "linha", "circular", "rodoviaria"}


# --- texto ---------------------------------------------------------------------------------
def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bt\.\s*", "terminal ", s)
    s = s.replace("3a ponte", "terceira ponte").replace("2a ponte", "segunda ponte")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def tokens(s: str) -> set[str]:
    return {t for t in normalizar(s).split() if t not in GENERICAS and len(t) > 1}


def semelhanca(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def ref_norm(ref: str | None) -> str | None:
    m = re.match(r"^0*(\d{1,4})$", (ref or "").strip())
    return m.group(1).zfill(4) if m else None


# --- geometria -----------------------------------------------------------------------------
def montar_tracado(vias: list[list[list[float]]]) -> list[list[float]]:
    """Encadeia as vias da relação na ordem, invertendo as que estiverem ao contrário."""
    vias = [v for v in vias if len(v) >= 2]
    if not vias:
        return []
    linha = list(vias[0])
    if len(vias) > 1:
        prox = vias[1]
        d_fim = min(_dist(linha[-1], prox[0]), _dist(linha[-1], prox[-1]))
        d_ini = min(_dist(linha[0], prox[0]), _dist(linha[0], prox[-1]))
        if d_ini < d_fim:
            linha.reverse()
    for v in vias[1:]:
        if _dist(linha[-1], v[-1]) < _dist(linha[-1], v[0]):
            v = list(reversed(v))
        linha.extend(v[1:] if _dist(linha[-1], v[0]) < 1 else v)
    return linha


def _dist(a: list[float], b: list[float]) -> float:
    return distancia_m(a[1], a[0], b[1], b[0])


def _projetar(
    ponto: tuple[float, float], tracado: list[list[float]], acum: list[float], ini: int
) -> tuple[float, int, float]:
    """Projeção do ponto (lat, lon) no traçado, avançando a partir do segmento `ini`.
    Retorna (distância ao longo, índice do segmento, afastamento em metros)."""
    lat, lon = ponto
    kx = 111_320 * math.cos(math.radians(lat))
    ky = 110_540
    melhor = (float("inf"), ini, 0.0)
    for i in range(ini, len(tracado) - 1):
        ax, ay = (tracado[i][0] - lon) * kx, (tracado[i][1] - lat) * ky
        bx, by = (tracado[i + 1][0] - lon) * kx, (tracado[i + 1][1] - lat) * ky
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L2))
        px, py = ax + t * dx, ay + t * dy
        d = math.hypot(px, py)
        if d < melhor[0]:
            melhor = (d, i, acum[i] + t * math.sqrt(L2))
        if melhor[0] < 25 and d > 600:  # já passou do ponto
            break
    return melhor[2], melhor[1], melhor[0]


# --- estruturas ----------------------------------------------------------------------------
@dataclass
class Padrao:
    linha: str
    sentido: int
    rel_id: int
    pontos: list[str]  # stop_id
    dist: list[float]  # metros ao longo do traçado
    tracado: list[list[float]]
    destino: str
    aproximado: bool = False


@dataclass
class Relatorio:
    linhas_portal: int = 0
    linhas_roteaveis: list[str] = field(default_factory=list)
    sem_osm: list[dict[str, str]] = field(default_factory=list)
    sentidos_sem_osm: list[dict[str, str]] = field(default_factory=list)
    nome_divergente: list[dict[str, Any]] = field(default_factory=list)
    tracado_aproximado: list[str] = field(default_factory=list)
    ordem_inconsistente: list[str] = field(default_factory=list)
    duracao_implausivel: list[str] = field(default_factory=list)
    viagens: int = 0
    pontos: int = 0


# --- montagem ------------------------------------------------------------------------------
def _carregar_ceturb(pasta: Path) -> tuple[list[dict[str, Any]], str]:
    lista = json.loads((pasta / "linhas.json").read_text(encoding="utf-8"))
    quadros = []
    for item in lista["linhas"]:
        arq = pasta / "linhas" / f"{item['numero']}.json"
        if arq.exists():
            q = json.loads(arq.read_text(encoding="utf-8"))
            if q.get("sentidos"):
                quadros.append(q)
    return quadros, lista["coletado_em"][:10]


def _origem_rel(r: dict[str, Any]) -> str:
    t = r["tags"]
    if t.get("from"):
        return t["from"]
    nome = t.get("name", "")
    m = re.search(r":\s*(.*?)\s*(=>|→|->)", nome)
    return m.group(1) if m else nome


def _dividir_ida_volta(r: dict[str, Any], nos: dict[str, Any]) -> list[dict[str, Any]] | None:
    """Se a relação começa e termina no mesmo lugar, devolve duas meias-relações (ida e volta),
    cortadas no ponto mais distante do início. As paradas e a ordem continuam sendo as do OSM."""
    pts = _paradas_rel(r, nos)
    if len(pts) < 6:
        return None
    a, b = nos[pts[0]], nos[pts[-1]]
    if distancia_m(a["lat"], a["lon"], b["lat"], b["lon"]) > 400:
        return None
    k = max(range(len(pts)), key=lambda i: distancia_m(a["lat"], a["lon"], nos[pts[i]]["lat"], nos[pts[i]]["lon"]))
    if k < 2 or k > len(pts) - 3:
        return None
    meias = []
    for parte, sufixo in ((pts[: k + 1], "ida"), (pts[k:], "volta")):
        origem = nos[parte[0]]["tags"].get("name") or ""
        meias.append(
            {
                "id": r["id"] * 10 + (1 if sufixo == "ida" else 2),
                "tags": {
                    **r["tags"],
                    "from": r["tags"].get("from", origem) if sufixo == "ida" else r["tags"].get("to", origem),
                },
                "membros": [{"tipo": "n", "ref": int(n), "papel": "platform"} for n in parte],
                "dividida_de": r["id"],
            }
        )
    return meias


def _paradas_rel(r: dict[str, Any], nos: dict[str, Any]) -> list[str]:
    plat = [
        str(m["ref"])
        for m in r["membros"]
        if m["tipo"] == "n" and m["papel"] in PAPEIS_PLATAFORMA and str(m["ref"]) in nos
    ]
    par = [
        str(m["ref"]) for m in r["membros"] if m["tipo"] == "n" and m["papel"] in PAPEIS_PARADA and str(m["ref"]) in nos
    ]
    seq = plat if len(plat) >= max(2, int(0.6 * len(par))) else par
    out: list[str] = []
    for nid in seq:
        if out and (
            out[-1] == nid
            or distancia_m(nos[out[-1]]["lat"], nos[out[-1]]["lon"], nos[nid]["lat"], nos[nid]["lon"]) < 20
        ):
            continue
        out.append(nid)
    return out


def _horarios(lista: list[str]) -> list[tuple[int, str]]:
    res = []
    for h in lista:
        m = re.match(r"^(\d{1,2}):(\d{2})\s*([A-Za-z]*)", h.strip())
        if m:
            res.append((int(m.group(1)) * 3600 + int(m.group(2)) * 60, m.group(3).upper()))
    return sorted(res)


def _quadros_por_servico(sentido: dict[str, Any]) -> dict[str, list[tuple[int, str]]]:
    """Dia útil = quadro mais comum de segunda a sexta (a semana coletada pode ter feriado)."""
    por_dia = {d["dia"]: _horarios(d["horarios"]) for d in sentido["dias"]}
    uteis = [tuple(por_dia[d]) for d in DIAS_CETURB[:5] if por_dia.get(d)]
    res: dict[str, list[tuple[int, str]]] = {}
    if uteis:
        res["UTIL"] = list(Counter(uteis).most_common(1)[0][0])
    if por_dia.get("Sábado"):
        res["SAB"] = por_dia["Sábado"]
    if por_dia.get("Domingo"):
        res["DOM"] = por_dia["Domingo"]
    return res


def _servico_tipo(nome: str) -> str:
    n = len(re.findall(r"\bT\.\s", nome.upper() + " "))
    if n >= 2:
        return "troncal"
    if n == 1:
        return "alimentadora"
    return "municipal"


def _velocidade(cfg: dict[str, Any], servico: str, t: int) -> float:
    faixas = cfg["faixas"]
    h = (t // 3600) % 24 + (t % 3600) / 3600
    for f in faixas:
        if f["inicio"] <= h < f["fim"]:
            v = f["kmh"]
            break
    else:
        v = cfg["padrao_kmh"]
    return v * cfg.get("fator_servico", {}).get(servico, 1.0) / 3.6


def construir(ceturb: Path, osm_json: Path, raiz_config: Path, saida: Path, dias_validade: int = 60) -> Relatorio:
    quadros, data_coleta = _carregar_ceturb(ceturb)
    osm = json.loads(osm_json.read_text(encoding="utf-8"))
    nos: dict[str, Any] = osm["nos"]
    vias: dict[str, list[list[float]]] = osm["vias"]
    nomes_vias: dict[str, str] = osm.get("nomes_vias", {})
    vel = yaml.safe_load((raiz_config / "velocidades.yaml").read_text(encoding="utf-8"))
    cal = yaml.safe_load((raiz_config / "calendario.yaml").read_text(encoding="utf-8"))
    rel = Relatorio(linhas_portal=len(quadros))
    terminais = [x for x in osm.get("lugares", []) if x["tipo"] == "amenity=bus_station"]

    por_ref: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in osm["rotas"]:
        k = ref_norm(r["tags"].get("ref"))
        if k:
            por_ref[k].append(r)

    padroes: list[Padrao] = []
    viagens: list[dict[str, Any]] = []
    stop_times: list[dict[str, Any]] = []
    rotas: list[dict[str, Any]] = []
    usados: set[str] = set()
    nome_ponto: dict[str, str] = {}

    for q in quadros:
        num = q["numero"]
        nome_linha = q["nome"]
        texto_ceturb = f"{nome_linha} {q.get('descricao', '')}"
        candidatas = []
        for r in por_ref.get(num, []):
            texto_osm = " ".join(r["tags"].get(k, "") for k in ("name", "from", "to"))
            sim = semelhanca(texto_ceturb, texto_osm)
            if sim >= cal["cruzamento"]["semelhanca_minima"]:
                candidatas.append(r)
            else:
                rel.nome_divergente.append(
                    {"linha": num, "ceturb": nome_linha, "osm": r["tags"].get("name", ""), "sim": round(sim, 2)}
                )
        if not candidatas:
            rel.sem_osm.append({"linha": num, "nome": nome_linha})
            continue

        sentidos = q["sentidos"]
        # Relação única de ida e volta (comum nas linhas municipais antigas no OSM): divide no retorno.
        if len(candidatas) == 1 and len(sentidos) == 2:
            metades = _dividir_ida_volta(candidatas[0], nos)
            if metades:
                candidatas = metades
        # Associa cada sentido da Ceturb à relação cuja origem mais se parece com a "saída".
        pares = sorted(
            ((semelhanca(s["saida"], _origem_rel(r)), i, r["id"]) for i, s in enumerate(sentidos) for r in candidatas),
            reverse=True,
        )
        escolha: dict[int, dict[str, Any]] = {}
        rels_usadas: set[int] = set()
        por_id = {r["id"]: r for r in candidatas}
        for sim, i, rid in pares:
            if i in escolha or rid in rels_usadas:
                continue
            if sim == 0 and len(candidatas) > 1:
                continue
            escolha[i] = por_id[rid]
            rels_usadas.add(rid)

        servico = _servico_tipo(nome_linha)
        notas = {}
        for o in q.get("orientacoes", []):
            m = re.match(r"^\s*([A-Za-z]+)\s*-\s*(.+)$", o)
            if m:
                notas[m.group(1).upper()] = m.group(2).strip().capitalize()
        algum = False
        for i, s in enumerate(sentidos):
            r = escolha.get(i)
            if not r:
                rel.sentidos_sem_osm.append({"linha": num, "saida": s["saida"]})
                continue
            pts = _paradas_rel(r, nos)
            if len(pts) < 2:
                rel.sentidos_sem_osm.append({"linha": num, "saida": s["saida"]})
                continue
            # Controle de qualidade: pontos fora de ordem fazem a cadeia ziguezaguear.
            p0 = nos[pts[0]]
            longe = max(distancia_m(p0["lat"], p0["lon"], nos[x]["lat"], nos[x]["lon"]) for x in pts)
            cadeia = sum(
                distancia_m(nos[a]["lat"], nos[a]["lon"], nos[b]["lat"], nos[b]["lon"])
                for a, b in zip(pts, pts[1:], strict=False)
            )
            if longe < 300 or cadeia / longe > cal["cruzamento"]["razao_maxima_cadeia"]:
                rel.ordem_inconsistente.append(
                    f"{num}/{s['saida']} ({cadeia / 1000:.0f} km de cadeia, {longe / 1000:.1f} km de alcance)"
                )
                continue
            tracado = montar_tracado(
                [vias[str(m["ref"])] for m in r["membros"] if m["tipo"] == "w" and str(m["ref"]) in vias]
            )
            acum = [0.0]
            for a, b in zip(tracado, tracado[1:], strict=False):
                acum.append(acum[-1] + _dist(a, b))
            dist: list[float] = []
            aproximado = len(tracado) < 2
            seg = 0
            for nid in pts:
                p = (nos[nid]["lat"], nos[nid]["lon"])
                if not aproximado:
                    d, seg, afast = _projetar(p, tracado, acum, seg)
                    if afast > 250:
                        aproximado = True
                    dist.append(d)
            if aproximado or any(b < a for a, b in zip(dist, dist[1:], strict=False)):
                aproximado = True
            reta = [
                1.3 * distancia_m(nos[a]["lat"], nos[a]["lon"], nos[b]["lat"], nos[b]["lon"])
                for a, b in zip(pts, pts[1:], strict=False)
            ]
            if aproximado:
                trechos = reta
                tracado = [[nos[n]["lon"], nos[n]["lat"]] for n in pts]
                rel.tracado_aproximado.append(f"{num}/{s['saida']}")
            else:
                # Trecho incoerente no traçado (laço, salto): usa linha reta x 1,3 só naquele trecho.
                trechos = []
                for k2, (d0, d1) in enumerate(zip(dist, dist[1:], strict=False)):
                    seg_t = d1 - d0
                    trechos.append(seg_t if seg_t <= 2.5 * reta[k2] / 1.3 + 150 else reta[k2])
            if sum(trechos) > 1.5 * sum(reta) / 1.3:
                trechos = [x * 1.25 / 1.3 for x in reta]
            dist = [0.0]
            for t_ in trechos:
                dist.append(dist[-1] + t_)
            fora_pico = dist[-1] / _velocidade(vel, servico, 10 * 3600) + len(pts) * vel["parada_s"]
            if fora_pico > cal["cruzamento"]["duracao_maxima_min"] * 60:
                rel.duracao_implausivel.append(
                    f"{num}/{s['saida']} ({dist[-1] / 1000:.0f} km, {fora_pico / 60:.0f} min às 10h)"
                )
                continue
            outros = [x["saida"] for j, x in enumerate(sentidos) if j != i]
            destino = outros[0].title() if outros else (r["tags"].get("to") or nome_linha.title())
            pad = Padrao(num, i, r["id"], [f"n{n}" for n in pts], dist, tracado, destino, aproximado)
            padroes.append(pad)
            usados.update(pts)
            algum = True
            for nid in pts:
                nome_ponto.setdefault(nid, _nome_ponto(nid, nos, r, vias, nomes_vias, terminais))

            for sid, horarios in _quadros_por_servico(s).items():
                for t0, cod in horarios:
                    v = _velocidade(vel, servico, t0)
                    tid = f"{num}-{i}-{sid}-{t0 // 60:04d}{cod}"
                    nota = notas.get(cod[:1]) if cod else None
                    viagens.append(
                        {
                            "route_id": num,
                            "service_id": sid,
                            "trip_id": tid,
                            "direction_id": min(i, 1),
                            "trip_headsign": pad.destino + (f" ({nota.lower()})" if nota else ""),
                            "shape_id": f"{num}-{i}",
                        }
                    )
                    for k, (pid, d) in enumerate(zip(pad.pontos, pad.dist, strict=True)):
                        t = t0 + round(d / v + k * vel["parada_s"])
                        stop_times.append(
                            {
                                "trip_id": tid,
                                "arrival_time": _hms(t),
                                "departure_time": _hms(t),
                                "stop_id": pid,
                                "stop_sequence": k + 1,
                                "timepoint": 1 if k == 0 else 0,
                                "shape_dist_traveled": round(d, 1),
                            }
                        )
        if algum:
            rel.linhas_roteaveis.append(num)
            rotas.append(
                {
                    "route_id": num,
                    "agency_id": "TRANSCOL",
                    "route_short_name": num,
                    "route_long_name": nome_linha,
                    "route_desc": servico,
                    "route_type": 3,
                }
            )

    rel.viagens = len(viagens)
    rel.pontos = len(usados)
    _escrever_gtfs(saida, data_coleta, dias_validade, cal, nos, nome_ponto, usados, rotas, viagens, stop_times, padroes)
    (saida / "relatorio.json").write_text(json.dumps(rel.__dict__, ensure_ascii=False, indent=1), encoding="utf-8")
    return rel


def _nome_ponto(
    nid: str,
    nos: dict[str, Any],
    r: dict[str, Any],
    vias: dict[str, Any],
    nomes_vias: dict[str, str],
    terminais: list[dict[str, Any]],
) -> str:
    tags = nos[nid]["tags"]
    lat, lon = nos[nid]["lat"], nos[nid]["lon"]
    # Dentro de um terminal (amenity=bus_station no OSM): usa o nome do terminal.
    for t in terminais:
        if distancia_m(lat, lon, t["lat"], t["lon"]) < 150:
            return t["nome"]
    if tags.get("name"):
        return tags["name"]
    melhor, nome = 80.0, None
    for m in r["membros"]:
        wid = str(m["ref"])
        if m["tipo"] != "w" or wid not in nomes_vias:
            continue
        for c in vias.get(wid, [])[::2]:
            d = distancia_m(lat, lon, c[1], c[0])
            if d < melhor:
                melhor, nome = d, nomes_vias[wid]
    return f"Ponto na {nome}" if nome else "Ponto sem nome"


def _hms(t: int) -> str:
    return f"{t // 3600:02d}:{t % 3600 // 60:02d}:{t % 60:02d}"


def _escrever(pasta: Path, nome: str, linhas: list[dict[str, Any]]) -> None:
    if not linhas:
        return
    with (pasta / nome).open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(linhas)


def _escrever_gtfs(
    saida: Path,
    data_coleta: str,
    dias: int,
    cal: dict[str, Any],
    nos: dict[str, Any],
    nome_ponto: dict[str, str],
    usados: set[str],
    rotas: list[dict[str, Any]],
    viagens: list[dict[str, Any]],
    stop_times: list[dict[str, Any]],
    padroes: list[Padrao],
) -> None:
    saida.mkdir(parents=True, exist_ok=True)
    ini = date.fromisoformat(data_coleta)
    fim = ini + timedelta(days=dias - 1)
    _escrever(
        saida,
        "agency.txt",
        [
            {
                "agency_id": "TRANSCOL",
                "agency_name": "Transcol (horários públicos da Ceturb-ES)",
                "agency_url": "https://transcol.ceturb.es.gov.br/",
                "agency_timezone": "America/Sao_Paulo",
                "agency_lang": "pt",
            }
        ],
    )
    _escrever(
        saida,
        "feed_info.txt",
        [
            {
                "feed_publisher_name": "RotaVix (app independente)",
                "feed_publisher_url": "https://transcol.ceturb.es.gov.br/",
                "feed_lang": "pt",
                "feed_start_date": ini.strftime("%Y%m%d"),
                "feed_end_date": fim.strftime("%Y%m%d"),
                "feed_version": f"ceturb-{data_coleta}+osm",
            }
        ],
    )
    _escrever(
        saida,
        "stops.txt",
        [
            {
                "stop_id": f"n{nid}",
                "stop_name": nome_ponto.get(nid, "Ponto"),
                "stop_lat": f"{nos[nid]['lat']:.6f}",
                "stop_lon": f"{nos[nid]['lon']:.6f}",
                "location_type": 0,
            }
            for nid in sorted(usados, key=int)
        ],
    )
    _escrever(saida, "routes.txt", rotas)
    dias_sem = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    regras = {"UTIL": [1, 1, 1, 1, 1, 0, 0], "SAB": [0, 0, 0, 0, 0, 1, 0], "DOM": [0, 0, 0, 0, 0, 0, 1]}
    _escrever(
        saida,
        "calendar.txt",
        [
            {
                "service_id": sid,
                **dict(zip(dias_sem, r, strict=True)),
                "start_date": ini.strftime("%Y%m%d"),
                "end_date": fim.strftime("%Y%m%d"),
            }
            for sid, r in regras.items()
        ],
    )
    feriados = holidays.country_holidays("BR", subdiv="ES", years=range(ini.year, fim.year + 1))
    quadro = cal["feriados"]["quadro"]
    datas = []
    for d, _nome in sorted(feriados.items()):
        if not (ini <= d <= fim):
            continue
        normal = "DOM" if d.weekday() == 6 else "SAB" if d.weekday() == 5 else "UTIL"
        if normal != quadro:
            datas.append({"service_id": normal, "date": d.strftime("%Y%m%d"), "exception_type": 2})
            datas.append({"service_id": quadro, "date": d.strftime("%Y%m%d"), "exception_type": 1})
    _escrever(saida, "calendar_dates.txt", datas)
    _escrever(saida, "trips.txt", viagens)
    _escrever(saida, "stop_times.txt", stop_times)
    shapes = []
    for p in padroes:
        d = 0.0
        for k, c in enumerate(p.tracado):
            if k:
                d += _dist(p.tracado[k - 1], c)
            shapes.append(
                {
                    "shape_id": f"{p.linha}-{p.sentido}",
                    "shape_pt_lat": f"{c[1]:.6f}",
                    "shape_pt_lon": f"{c[0]:.6f}",
                    "shape_pt_sequence": k + 1,
                    "shape_dist_traveled": round(d, 1),
                }
            )
    _escrever(saida, "shapes.txt", shapes)
