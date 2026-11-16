# RotaVix

App de ônibus independente para a Grande Vitória (Transcol + Aquaviário). PWA + Android (Capacitor) do mesmo código.
Requisitos: `docs/SPEC.md`. Plano e fases: `docs/PLANO.md`. Decisões: `docs/adr/`. Roteiros de validação: `docs/DEMO-faseN.md`.

## Comandos (rodar em `rotavix/`)

- Ambiente: `./scripts/doctor.sh` · instalar: `pnpm install && uv sync --all-packages`
- Dados de dev: `pnpm data` (rede sintética + mapa PMTiles + fontes em `apps/app/public`) · sem mapa: `pnpm data:sem-mapa`
- Dev: `pnpm --filter @rotavix/app dev` · build: `pnpm build` · preview: `pnpm --filter @rotavix/app preview`
- Testes: `pnpm test` (vitest) · `pnpm e2e` (Playwright, precisa de build) · `uv run pytest -q pipeline apps/api`
- Lint/tipos: `pnpm lint` · `pnpm typecheck` · `uv run ruff check . && uv run pyright`
- Contrato do formato: `pnpm fixtures` (regenera `packages/data-format/fixtures/sintetico.rvx`)
- GTFS: `pnpm gtfs:validar` · Android: `pnpm android:apk` e `pnpm android:instalar`
- Infra: `pnpm infra:up` (Postgres+Redis) · `pnpm infra:pesado` (com Valhalla e Photon) · `pnpm infra:down`

## Mapa das pastas

- `apps/app` React/Vite/Capacitor; `src/brand.ts` = nome, ícone e paleta; `src/motor` = worker do roteador; `src/dados` = OPFS/pacotes
- `apps/api` FastAPI · `pipeline` ETL Python (GTFS → `.rvx`, recorte PMTiles) · `pipeline/fixtures/sintetico` rede fictícia
- `packages/router` McRAPTOR, planejador, motivos, busca · `packages/data-format` formato `.rvx` (FORMATO.md) · `packages/ui` tokens
- `config` tarifas/scoring/flags · `data/overrides` correções e aliases · `infra` docker compose · `.github/workflows` CI

## Convenções

- Nunca inventar linhas, horários, tarifas ou integrações: sem fonte, vira config com `TODO(VERIFICAR)`. Dado fictício só na rede sintética, marcado como tal.
- Sem engenharia reversa do Ônibus GV nem endpoints privados. Chave de API nunca no cliente; perguntar antes de conta, serviço pago ou chave.
- Toda opção de rota tem motivos estruturados (`Motivo`), com texto em `explicar()`.
- O pipeline é o único escritor do `.rvx`; mudou o formato, atualize FORMATO.md, o leitor e a fixture.
- Conventional Commits, commits pequenos. UI, docs e commits em português. TS strict.
