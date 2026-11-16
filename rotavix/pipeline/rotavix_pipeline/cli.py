"""CLI do pipeline.  uv run rotavix-pipeline --help"""

from __future__ import annotations

import argparse
from pathlib import Path

import yaml

from . import gtfs, manifest, mapa, rvx, sintetico

RAIZ = Path(__file__).resolve().parents[2]
SINT = RAIZ / "pipeline/fixtures/sintetico"
PUBLICO = RAIZ / "apps/app/public"
MARGEM_GRAUS = 0.019  # ~2 km (SPEC §3.5: bbox dos pontos + 2 km)


def _scoring() -> dict:
    return yaml.safe_load((RAIZ / "config/scoring.yaml").read_text(encoding="utf-8"))


def cmd_sintetico(_: argparse.Namespace) -> None:
    sintetico.gerar(SINT / "rede.yaml", SINT / "gtfs")
    print(f"GTFS sintético em {SINT / 'gtfs'}")


def cmd_rede(a: argparse.Namespace) -> None:
    feed = gtfs.carregar(Path(a.gtfs))
    dados = rvx.construir(feed, sintetica=a.sintetica, fonte=a.fonte, scoring=_scoring())
    saida = Path(a.saida)
    rvx.salvar(dados, saida)
    e = manifest.registrar(saida.parent, "rede", saida, "Linhas, pontos e horários", True, {"sintetica": a.sintetica})
    print(f"{saida.name}: {e['bytes'] / 1024:.1f} KB  sha256={e['sha256'][:12]}…")


def _bbox_da_rede(arquivo: Path) -> tuple[float, float, float, float]:
    cab = rvx.ler_cabecalho(arquivo.read_bytes())
    import struct

    dados = arquivo.read_bytes()
    inicio = (8 + struct.unpack("<I", dados[4:8])[0] + 7) // 8 * 8
    n = cab["secoes"]["ponto_lat"]["n"]
    lats = struct.unpack(f"<{n}f", dados[inicio + cab["secoes"]["ponto_lat"]["offset"] :][: 4 * n])
    lons = struct.unpack(f"<{n}f", dados[inicio + cab["secoes"]["ponto_lon"]["offset"] :][: 4 * n])
    m = MARGEM_GRAUS
    return (min(lons) - m, min(lats) - m, max(lons) + m, max(lats) + m)


def cmd_mapa(a: argparse.Namespace) -> None:
    bbox = tuple(map(float, a.bbox.split(","))) if a.bbox else _bbox_da_rede(Path(a.rede))
    saida = Path(a.saida)
    info = mapa.recortar(saida, bbox, zmax=a.zmax, build=a.build)  # type: ignore[arg-type]
    e = manifest.registrar(
        saida.parent,
        a.id,
        saida,
        a.descricao,
        a.id == "mapa-basico",
        {"zmax": a.zmax, "bbox": list(bbox), "build": info["build"]},
    )
    print(f"{saida.name}: {info['tiles']} tiles, {e['bytes'] / 1e6:.1f} MB (build {info['build']})")


def cmd_assets(a: argparse.Namespace) -> None:
    total = mapa.baixar_assets(Path(a.saida))
    print(f"assets do mapa: {total / 1024:.0f} KB em {a.saida}")


def cmd_dev(a: argparse.Namespace) -> None:
    """Prepara tudo o que o app precisa em dev com a rede sintética."""
    cmd_sintetico(a)
    pacotes = PUBLICO / "pacotes"
    cmd_rede(
        argparse.Namespace(
            gtfs=str(SINT / "gtfs"),
            saida=str(pacotes / "rede.rvx"),
            sintetica=True,
            fonte="rede sintética de teste (pipeline/fixtures/sintetico)",
        )
    )
    if a.sem_mapa:
        return
    cmd_assets(argparse.Namespace(saida=str(PUBLICO / "map-assets")))
    alvo = pacotes / "mapa-basico.pmtiles"
    if alvo.exists() and not a.refazer_mapa:
        print(f"{alvo.name} já existe (use --refazer-mapa para baixar de novo)")
        return
    cmd_mapa(
        argparse.Namespace(
            bbox=None,
            rede=str(pacotes / "rede.rvx"),
            saida=str(alvo),
            zmax=14,
            build=None,
            id="mapa-basico",
            descricao="Mapa básico (até zoom 14)",
        )
    )


def main() -> None:
    p = argparse.ArgumentParser(prog="rotavix-pipeline")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("sintetico", help="gera o GTFS da rede sintética de teste")
    s.set_defaults(f=cmd_sintetico)

    s = sub.add_parser("rede", help="GTFS -> pacote .rvx")
    s.add_argument("--gtfs", required=True)
    s.add_argument("--saida", required=True)
    s.add_argument("--sintetica", action="store_true")
    s.add_argument("--fonte", default="")
    s.set_defaults(f=cmd_rede)

    s = sub.add_parser("mapa", help="recorte PMTiles da Protomaps")
    s.add_argument("--saida", required=True)
    s.add_argument("--bbox", help="oeste,sul,leste,norte (padrão: pontos da rede + 2 km)")
    s.add_argument("--rede", default=str(PUBLICO / "pacotes/rede.rvx"))
    s.add_argument("--zmax", type=int, default=14)
    s.add_argument("--build", help="ex.: 20261116.pmtiles (padrão: mais recente)")
    s.add_argument("--id", default="mapa-basico")
    s.add_argument("--descricao", default="Mapa básico (até zoom 14)")
    s.set_defaults(f=cmd_mapa)

    s = sub.add_parser("assets", help="fontes e sprites do mapa")
    s.add_argument("--saida", default=str(PUBLICO / "map-assets"))
    s.set_defaults(f=cmd_assets)

    s = sub.add_parser("dev", help="rede sintética + mapa + assets em apps/app/public")
    s.add_argument("--sem-mapa", action="store_true")
    s.add_argument("--refazer-mapa", action="store_true")
    s.set_defaults(f=cmd_dev)

    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
