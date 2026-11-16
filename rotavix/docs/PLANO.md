# Plano do RotaVix

Base: `docs/SPEC.md` (completa). Fases e critérios de aceite seguem a seção 11.

## 1. Arquitetura

```
           ┌────────────── Cliente (PWA e Android, mesmo código) ───────────────┐
           │ React + Vite ─ MapLibre + PMTiles ─ busca local (offline)           │
           │        │                                                            │
           │        └─ Web Worker (Comlink): packages/router                     │
           │             timetable .rvx (typed arrays) + overlay de fatores      │
           │             por trecho → McRAPTOR → ranking → motivos               │
           │ DataStore / TileStore: OPFS (PWA e WebView) | Filesystem (Capacitor)│
           └──────────────▲───────────────────────────▲────────────────────────┘
               pacotes    │ (R2 + manifest assinado)  │ SSE: deltas de fator/trecho, veículos
                          │                           │
   pipeline/ (ETL Python) ┘          apps/api (FastAPI) ─ Postgres/PostGIS, Redis
   GTFS → validador → .rvx →         provedores: tabela, simulador, colaborativo, gtfs_rt,
   hops → perfis → índice → PMTiles  [oficial], trânsito (proxy + ProviderBudget), clima
```

Princípios:

- **Um motor só**, no cliente, igual online e offline. Online ele só recebe fatores mais frescos.
- **Tudo atrás de adaptadores**: tempo real, lotação, trânsito, incidentes, clima, geocodificação, armazenamento.
- **Dado da rede é dado, não código**: tarifas, aliases, feriados e overrides em YAML versionado.
- **Toda rota explica o porquê**: o motor devolve motivos estruturados (`Motivo[]`); a UI só formata o texto.
- **Python escreve, TS lê**: o pipeline é o único escritor do formato `.rvx`; `packages/data-format` documenta e lê.

## 2. Árvore de pastas

```
rotavix/
  apps/app/            React + TS + Vite; PWA (injectManifest) e Android (Capacitor, apps/app/android)
  apps/api/            FastAPI (uv); provedores em rotavix_api/providers/
  packages/router/     McRAPTOR, overlay, ranking, motivos (TS puro, vitest)
  packages/data-format/ formato .rvx (spec em FORMATO.md) + leitor TS
  packages/ui/         design tokens (claro/escuro, semânticos, cores de linha) + testes de contraste
  pipeline/            ETL Python (uv): GTFS → .rvx, índice, extrato PMTiles; fixtures/sintetico
  infra/               docker-compose.yml (profiles: roteamento, busca, pesado)
  config/              tarifas.yaml, scoring.yaml, flags.yaml
  data/overrides/      correções manuais e aliases
  scripts/             doctor.sh, gtfs-validator.sh, android helpers
  docs/                SPEC, PLANO, adr/, FONTES_DE_DADOS, DEMO-faseN
  .github/workflows/   CI (vira a raiz quando o projeto for para o repositório próprio)
```

## 3. Fases

### Fase 0: Fundação (concluída, aguardando validação no Poco)

_Aceite: em modo avião, abrir o app, buscar um ponto e planejar uma rota no GTFS sintético._

- [x] SPEC, PLANO, CLAUDE.md, ADRs 0001 e 0002, doctor.sh, compose multi-arch com profiles, configs
- [x] Monorepo: pnpm (TS 6.0, ESLint, Prettier) + uv (Ruff, pyright, pytest)
- [x] GTFS sintético pequeno em `pipeline/fixtures/sintetico/`, **marcado como fictício** em todos os nomes e no app
- [x] Pipeline: GTFS → pacote `.rvx` (timetable em typed arrays + transferências a pé estimadas) + manifest com sha256
- [x] `packages/data-format`: especificação do `.rvx` + leitor TS + teste de contrato com o arquivo gerado pelo Python
- [x] `packages/router`: McRAPTOR (chegada, baldeações, caminhada) com acesso a pé, motivos básicos, testes com resposta conhecida
- [x] Extrato PMTiles do mapa (Protomaps, bbox da região, até z14) + fontes e sprites locais
- [x] `packages/ui`: tokens (azul-oceano + coral, claro/escuro, semânticos, cores por tipo de serviço) com teste de contraste WCAG
- [x] App: shell React, mapa como protagonista, bottom sheet no celular e painel lateral no desktop, busca de pontos, planejador e cartões de rota
- [x] Worker com Comlink rodando o roteador; DataStore/TileStore em OPFS; download inicial dos pacotes
- [x] PWA instalável (manifest, ícones maskable, service worker injectManifest), orçamento de 170 KB gzip no shell
- [x] E2E Playwright com `setOffline(true)` cobrindo o critério de aceite
- [x] Capacitor Android + APK de debug
- [x] CI: lint, tipos, testes, build, orçamento de tamanho, GTFS Validator (sintético), e2e, APK como artefato (escrito; roda quando houver o repositório próprio)
- [x] `docs/DEMO-fase0.md` (roteiro no Poco via adb e no navegador)

### Fase 1: Rede real offline

Pipeline com GTFS validado da Grande Vitória (site da Ceturb respeitando robots.txt e termos, OSM, overrides), telas de linha, ponto e quadro de horários, busca com sinônimos e aliases, pacotes assinados (Ed25519) e Central Offline, `TileStore`/`DataStore` com Capacitor Filesystem, detector de mudanças.
_Aceite: cenários 4 e 5; GTFS sem erros; relatório de mudanças funcionando._

### Fase 2: Trânsito inteligente

Proxy TomTom com `ProviderBudget` (**[PERGUNTAR]** conta e chave), incidentes, Open-Meteo, PRF, hops com faixa exclusiva, overlay dinâmico, ranking p50/p90, diversidade, explicações, "Trânsito agora".
_Aceite: cenários 1 a 3 com trânsito simulado e real; cota dentro do orçamento._

### Fase 3: Tempo real

Provedores (simulador, tabela, GTFS-RT, colaborativo), fusão, SSE, previsão, viagem ativa com foreground service (sem localização em segundo plano), alerta de desembarque, "saia agora", re-roteamento. **Validação no Poco X7 Pro (HyperOS)** e tela de orientação de bateria.
_Aceite: ônibus simulados suaves; origem e idade do dado sempre visíveis; bateria e dados medidos._

### Fase 4: Comunidade, lotação e lançamento

Relatos com anti-abuso, lotação, câmeras da Terceira Ponte (link), acessibilidade, widget, release e checklist da Play Store (**[PERGUNTAR]** antes de conta/publicação).
_Aceite: Lighthouse ≥ 90; acessibilidade ok; AAB assinado para teste interno._

### Fase 5: Integração oficial

Depende de autorização por escrito (**[PERGUNTAR]**).

## 4. Metas de desempenho e como medir

- Shell + UI inicial < 170 KB gzip (checado no CI); MapLibre e roteador em chunks separados.
- Rota offline < 700 ms p95: benchmark do roteador no Node e no navegador com **CPU throttling 4x** (CDP) e perfil de aparelho de entrada (Moto G4/Lighthouse mobile).
- Medição também no Poco X7 Pro via `chrome://inspect`.

## 5. Riscos principais

| Risco                                                  | Impacto | Mitigação                                                            |
| ------------------------------------------------------ | ------- | -------------------------------------------------------------------- |
| Sem GTFS oficial; site da Ceturb pode mudar            | Alto    | Coletor isolado, cache, OSM como 2ª fonte, overrides manuais         |
| Tempos intermediários estimados divergirem da operação | Alto    | `timepoint=0`, rótulo "estimado", recalibrar com sonda colaborativa  |
| Rede mudando (renumeração de Vila Velha)               | Médio   | Detector de mudanças diário + aliases versionados                    |
| HyperOS matando o serviço da viagem ativa              | Alto    | Foreground service tipo location, teste no aparelho, tela de bateria |
| MapLibre GL JS pesado no WebView de entrada            | Médio   | Medir com throttling; plano B MapLibre Native documentado            |
| Cotas e termos de TomTom/HERE                          | Médio   | Ler termos antes; histórico só da sonda e relatos se proibido        |
| Open-Meteo grátis é não comercial                      | Baixo   | Registrado em FONTES_DE_DADOS; trocar se monetizar                   |
| Tamanho dos pacotes offline                            | Médio   | PMTiles em dois níveis, timetable compacto, tamanho exibido          |
| Ferramentas de lint ainda sem suporte a TS 7           | Baixo   | TS 6.0 até o typescript-eslint suportar o 7                          |
