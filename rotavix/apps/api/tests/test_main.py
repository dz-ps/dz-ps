from fastapi.testclient import TestClient
from rotavix_api.main import app

client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_provedor_oficial_desligado_por_padrao() -> None:
    assert client.get("/flags").json()["realtime"]["oficial"] is False
