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
bash supabase/tests/run.sh                   # migrations + RLS no Postgres 16 local
pnpm evals                                   # evals do draft (modo deterministic; precisa do catálogo real)
```

## Dados e backend

```sh
(cd pipeline && uv run riftbuild run)              # coleta e valida o patch atual (out/ + report.md)
(cd pipeline && uv run riftbuild run --publish)    # publica no Supabase (SUPABASE_URL + service role)
```

- Supabase: aplique `supabase/migrations`, ative o login anônimo e publique a função `ai`
  (`supabase functions deploy ai`) com os secrets listados em `.env.example`. Os nomes dos modelos
  (`AI_MODEL_*`) vêm só de variável de ambiente; confira os atuais em https://docs.claude.com.
- O workflow `pipeline.yml` roda todo dia: coleta, publica, gera as dicas de meta do patch e apaga
  logs antigos de IA.

## Release (EAS)

`apps/mobile/eas.json` tem os perfis `development` (APK com dev client), `preview` (APK interno) e
`production` (AAB para a Play Store). O hook `eas-build-pre-install` embute o último catálogo publicado
como seed. Antes do primeiro build: `npx eas-cli@latest init` e as variáveis `EXPO_PUBLIC_SUPABASE_URL`
e `EXPO_PUBLIC_SUPABASE_ANON_KEY` nos ambientes do EAS.

Loja e privacidade: [docs/store/checklist.md](docs/store/checklist.md),
[docs/store/listing.pt-BR.md](docs/store/listing.pt-BR.md), [docs/privacy.md](docs/privacy.md) e
[docs/store/data-safety.md](docs/store/data-safety.md).
