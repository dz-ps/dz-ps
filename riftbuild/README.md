# RiftBuild

Builds, meta do patch e assistente de draft com IA para **League of Legends: Wild Rift**. App Android
(Expo / React Native), interface em pt-BR. Projeto de fã gratuito e não oficial (veja [ATTRIBUTION.md](ATTRIBUTION.md)).

## Estrutura

| Pasta             | Conteúdo                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`     | App Expo (SDK 58, Expo Router, NativeWind, FlashList, expo-image, expo-sqlite, MMKV)                                               |
| `packages/shared` | Schemas zod e toda a lógica de regras (build, runas, feitiços, atributos, leitura de composição, parser de nomes, validação da IA) |
| `pipeline`        | Coleta de dados em Python (uv): buscar → normalizar → validar → comparar → publicar                                                |
| `supabase`        | Migrations, testes SQL e Edge Functions (Deno)                                                                                     |
| `evals`           | Casos de avaliação do assistente de draft                                                                                          |
| `contracts`       | JSON Schema gerado do pydantic, fixtures sintéticas e casos compartilhados Python/TS                                               |
| `scripts`         | Scripts de apoio (sync do shared para o Deno, checagem de fontes, screenshots)                                                     |
| `docs`            | Fontes, loja, privacidade e screenshots                                                                                            |

Decisões técnicas e motivos: [DECISIONS.md](DECISIONS.md).

## Rodando localmente

Pré-requisitos: Node 22, pnpm 10, Python 3.13 com [uv](https://docs.astral.sh/uv/).

```sh
pnpm install
cp .env.example .env            # preencha o que tiver; o app roda sem backend
pnpm --filter @riftbuild/mobile start   # Expo dev server (precisa de dev build: MMKV/expo-sqlite)
```

Dev build Android: `cd apps/mobile && npx expo run:android` (Android SDK local) ou
`npx eas-cli@latest build --profile development -p android`.

## Verificação

```sh
pnpm lint && pnpm typecheck && pnpm test     # TS: ESLint, tsc, Vitest (shared/evals) e Jest (app)
pnpm sync:deno --check && (cd supabase/functions && npx deno@2.9.6 test -A)
(cd pipeline && uv run ruff check && uv run pytest)
pnpm web:export && pnpm web:smoke            # export web + Playwright (screenshots em docs/screenshots)
pnpm check:sources                           # nenhuma fonte de LoL PC
```
