"""Funções geográficas simples (sem dependências pesadas)."""

import math

RAIO_TERRA_M = 6_371_008.8


def distancia_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância de grande círculo (haversine) em metros."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RAIO_TERRA_M * math.asin(math.sqrt(a))
