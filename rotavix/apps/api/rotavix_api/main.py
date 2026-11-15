"""API do RotaVix. Fase 0: só saúde e flags públicas."""

from pathlib import Path

import yaml
from fastapi import FastAPI

CONFIG_DIR = Path(__file__).resolve().parents[3] / "config"

app = FastAPI(title="RotaVix API", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/flags")
def flags() -> dict:
    return yaml.safe_load((CONFIG_DIR / "flags.yaml").read_text(encoding="utf-8"))
