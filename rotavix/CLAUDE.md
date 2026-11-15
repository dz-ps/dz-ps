# RotaVix

App de ônibus independente para a Grande Vitória (Transcol + Aquaviário). PWA + Android (Capacitor) do mesmo código.
Requisitos completos: `docs/SPEC.md`. Plano e fases: `docs/PLANO.md`. Decisões: `docs/adr/`.

## Comandos (rodar em `rotavix/`)
- Ambiente: `./scripts/doctor.sh`
- Infra leve: `pnpm infra:up` · com Valhalla/Photon: `pnpm infra:pesado` · parar: `pnpm infra:down`
- TS: `pnpm install` · `pnpm test` · `pnpm typecheck`
- API: `cd apps/api && uv sync && uv run pytest && uv run ruff check .`

## Mapa
- `apps/app` front (React/Vite/Capacitor); `apps/app/src/brand.ts` nome, ícone e paleta
- `apps/api` FastAPI; provedores atrás de interfaces
- `packages/router` motor de rotas em TS puro (roda em Web Worker)
- `packages/data-format` formato binário dos pacotes offline · `packages/ui` design system
- `pipeline` ETL Python · `infra` docker compose · `config` tarifas/scoring/flags · `data/overrides` correções e aliases

## Regras
- Nunca inventar linhas, horários, tarifas ou integrações: sem fonte, vira config com `TODO(VERIFICAR)`.
- Sem engenharia reversa do Ônibus GV nem endpoints privados.
- Chave de API nunca no cliente. Perguntar antes de conta, serviço pago ou chave.
- Conventional Commits, commits pequenos. Textos de UI e docs em português.
- Toda rota precisa de motivos estruturados (explicação gerada dos dados).
