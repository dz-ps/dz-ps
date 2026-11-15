# 0002. Imagens Docker multi-arch e serviços pesados em profiles

Data: 2026-11-15 · Status: aceito

## Contexto
Máquina de desenvolvimento: MacBook Air M1 (arm64). O setup precisa rodar também em Linux amd64.
Verificação com `docker manifest inspect` em 2026-11-15:

| Imagem | amd64 | arm64 |
|---|---|---|
| postgis/postgis:17-3.5 (oficial) | sim | **não** |
| imresamu/postgis:17-3.5 | sim | sim |
| redis:7-alpine | sim | sim |
| ghcr.io/valhalla/valhalla-scripted:latest | sim | sim |
| ghcr.io/rtuszik/photon-docker:latest | sim | sim |

## Decisão
- PostGIS via `imresamu/postgis` (multi-arch; evita emulação Rosetta/QEMU no M1).
- Valhalla e Photon nos profiles `roteamento`, `busca` e `pesado`; `up` sem profile sobe só DB e Redis.
- Portas ligadas em 127.0.0.1.
- Antes do primeiro deploy, fixar imagens por digest.

## Consequências
O M1 com 8 GB não precisa manter Valhalla/Photon de pé no dia a dia.
