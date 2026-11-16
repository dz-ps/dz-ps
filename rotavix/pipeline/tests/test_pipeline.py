import struct
from pathlib import Path

import pytest
from rotavix_pipeline import gtfs, mapa, rvx, sintetico
from rotavix_pipeline.geo import distancia_m

SINT = Path(__file__).resolve().parents[1] / "fixtures/sintetico"


@pytest.fixture(scope="module")
def pacote(tmp_path_factory: pytest.TempPathFactory) -> bytes:
    pasta = tmp_path_factory.mktemp("gtfs")
    sintetico.gerar(SINT / "rede.yaml", pasta)
    return rvx.construir(gtfs.carregar(pasta), sintetica=True, fonte="teste")


def _secao(dados: bytes, nome: str) -> tuple:
    cab = rvx.ler_cabecalho(dados)
    inicio = (8 + struct.unpack("<I", dados[4:8])[0] + 7) // 8 * 8
    s = cab["secoes"][nome]
    fmt = {"f32": "f", "i32": "i", "u32": "I", "u16": "H", "u8": "B"}[s["tipo"]]
    tam = struct.calcsize(fmt)
    o = inicio + s["offset"]
    return struct.unpack(f"<{s['n']}{fmt}", dados[o : o + tam * s["n"]])


def test_distancia() -> None:
    assert distancia_m(0, 0, 0, 1) == pytest.approx(111_195, rel=1e-3)


def test_cabecalho_marca_rede_sintetica(pacote: bytes) -> None:
    cab = rvx.ler_cabecalho(pacote)
    assert cab["versao"] == 1
    assert cab["rede"]["sintetica"] is True
    assert all(lin["id"].startswith("S") for lin in cab["linhas"])
    assert any(lin["tipo"] == 4 and lin["servico"] == "aquaviario" for lin in cab["linhas"])


def test_secoes_consistentes(pacote: bytes) -> None:
    cab = rvx.ler_cabecalho(pacote)
    n_pad = len(cab["padroes"])
    pp_ini = _secao(pacote, "padrao_pontos_ini")
    pv_ini = _secao(pacote, "padrao_viagens_ini")
    pt_ini = _secao(pacote, "padrao_tempos_ini")
    assert len(pp_ini) == len(pv_ini) == len(pt_ini) == n_pad + 1
    for p in range(n_pad):
        n_pontos = pp_ini[p + 1] - pp_ini[p]
        n_viagens = pv_ini[p + 1] - pv_ini[p]
        assert pt_ini[p + 1] - pt_ini[p] == n_pontos * n_viagens
    assert len(_secao(pacote, "chegada")) == pt_ini[-1]


def test_fifo_por_padrao(pacote: bytes) -> None:
    cab = rvx.ler_cabecalho(pacote)
    pp_ini, pv_ini, pt_ini = (
        _secao(pacote, n) for n in ("padrao_pontos_ini", "padrao_viagens_ini", "padrao_tempos_ini")
    )
    partida = _secao(pacote, "partida")
    for p in range(len(cab["padroes"])):
        n = pp_ini[p + 1] - pp_ini[p]
        for v in range(1, pv_ini[p + 1] - pv_ini[p]):
            for s in range(n):
                base = pt_ini[p]
                assert partida[base + v * n + s] >= partida[base + (v - 1) * n + s]


def test_transferencia_prainha_estacao(pacote: bytes) -> None:
    cab = rvx.ler_cabecalho(pacote)
    ids = cab["pontos"]["ids"]
    i, j = ids.index("PRA"), ids.index("PRAA")
    ini, para, seg = (_secao(pacote, n) for n in ("transf_ini", "transf_para", "transf_s"))
    destinos = dict(zip(para[ini[i] : ini[i + 1]], seg[ini[i] : ini[i + 1]], strict=True))
    assert j in destinos and 60 < destinos[j] < 300


def test_reprodutivel(pacote: bytes, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1767225600")
    sintetico.gerar(SINT / "rede.yaml", tmp_path)
    a = rvx.construir(gtfs.carregar(tmp_path), sintetica=True, fonte="teste")
    b = rvx.construir(gtfs.carregar(tmp_path), sintetica=True, fonte="teste")
    assert a == b


def test_tiles_na_bbox() -> None:
    tiles = mapa.tiles_na_bbox((-40.4, -20.35, -40.18, -20.15), 0, 3)
    assert (0, 0, 0) in tiles
    assert all(z <= 3 for z, _, _ in tiles)
