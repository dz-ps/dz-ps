"""Manifest dos pacotes offline (versão, sha256, tamanho). Assinatura Ed25519 entra na Fase 1."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def sha256_arquivo(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def registrar(
    pasta: Path, pid: str, arquivo: Path, descricao: str, obrigatorio: bool, extra: dict[str, Any] | None = None
) -> dict[str, Any]:
    mf = pasta / "manifest.json"
    dados: dict[str, Any] = json.loads(mf.read_text()) if mf.exists() else {"versao": 1, "pacotes": []}
    entrada = {
        "id": pid,
        "arquivo": arquivo.name,
        "sha256": sha256_arquivo(arquivo),
        "bytes": arquivo.stat().st_size,
        "descricao": descricao,
        "obrigatorio": obrigatorio,
        **(extra or {}),
    }
    dados["pacotes"] = [p for p in dados["pacotes"] if p["id"] != pid] + [entrada]
    dados["pacotes"].sort(key=lambda p: p["id"])
    dados["gerado_em"] = datetime.now(UTC).replace(microsecond=0).isoformat()
    mf.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n")
    return entrada
