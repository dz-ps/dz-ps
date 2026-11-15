# Plano do RotaVix

> **Status: provisório.** A SPEC chegou truncada na seção 6; as seções 7 a 13 (incluindo as fases da seção 11) estão faltando. As fases abaixo são minha proposta a partir das seções 0 a 6 e das prioridades que você deu (1. rotas que fogem do trânsito, 2. offline de verdade, 3. interface). Reajusto quando a seção 11 chegar.

## 1. Arquitetura

```
           ┌────────────── Cliente (PWA e Android, mesmo código) ───────────────┐
           │ React + Vite ─ MapLibre + PMTiles ─ busca MiniSearch (offline)      │
           │        │                                                            │
           │        └─ Web Worker (Comlink): packages/router                     │
           │             timetable (typed arrays, assinado Ed25519)              │
           │             + overlay de fatores por trecho → McRAPTOR → ranking    │
           │ DataStore / TileStore: OPFS+IndexedDB (PWA) | Filesystem (Capacitor)│
           └──────────────▲───────────────────────────▲────────────────────────┘
               pacotes    │ (R2 + manifest)           │ SSE: deltas de fator/trecho, veículos
                          │                           │
   pipeline/ (ETL Python) ┘          apps/api (FastAPI) ─ Postgres/PostGIS, Redis
   GTFS → validador → hops →         provedores: tabela, simulador, colaborativo, gtfs_rt,
   perfis → índice → PMTiles         [oficial], trânsito (proxy + ProviderBudget), clima
```

Princípios:
- **Um motor só**, no cliente. Online ele recebe fatores mais frescos; offline usa perfis históricos. Mesmo resultado, mesma explicação.
- **Tudo atrás de adaptadores**: tempo real, lotação, trânsito, incidentes, clima, geocodificação.
- **Dado da rede é dado, não código**: tarifas, aliases, feriados e overrides em YAML versionado.
- **Toda rota explica o porquê**: o ranking produz uma lista estruturada de motivos (`Motivo[]`), e a UI só formata.

## 2. Árvore de pastas

```
rotavix/
  apps/app/          React + TS + Vite; Capacitor em apps/app/android
  apps/api/          FastAPI (uv), provedores em apps/api/rotavix_api/providers/
  packages/router/   McRAPTOR, overlay, ranking, explicações (TS puro, vitest)
  packages/data-format/  formato binário dos pacotes + leitor/escritor + spec em docs/
  packages/ui/       design system (Tailwind + Radix)
  pipeline/          ETL Python (uv): fontes → GTFS → validação → pacotes
  infra/             docker-compose.yml (profiles: roteamento, busca, pesado)
  config/            tarifas.yaml, scoring.yaml, flags.yaml
  data/overrides/    correções manuais e aliases
  scripts/           doctor.sh, dev.sh, adb helpers
  docs/              SPEC, PLANO, ADRs, FONTES_DE_DADOS, SETUP, DEMO-faseN
```

## 3. Fases e tarefas

### Fase 0: Fundação (em andamento)
- [x] SPEC salva em `docs/SPEC.md`
- [x] `scripts/doctor.sh` (macOS/Linux) com lista do que falta e como instalar
- [x] `infra/docker-compose.yml` com imagens arm64 verificadas e serviços pesados em profiles
- [x] `config/` com tarifas (TODO(VERIFICAR)), scoring, flags; `data/overrides/aliases.yaml`
- [x] `apps/app/src/brand.ts`
- [x] ADRs 0001 (monorepo e local do código) e 0002 (imagens Docker)
- [ ] Workspace pnpm + tsconfig base + ESLint/Prettier; workspace uv para api e pipeline + Ruff/pyright
- [ ] Esqueletos: `packages/router` (vitest), `apps/api` (FastAPI `/health`, pytest), `pipeline` (CLI vazia, pytest)
- [ ] Esqueleto do app (Vite + React + PWA) com o aviso de app independente
- [ ] CI GitHub Actions (lint, tipos, testes); GTFS Validator entra na Fase 1
- [ ] `docs/DEMO-fase0.md`

### Fase 1: Dados estáticos
- Pesquisa e registro de fontes em `FONTES_DE_DADOS.md` (licença, robots.txt, frequência)
- Coletor do site da Ceturb (respeitando robots/termos, User-Agent com contato, cache) e importador de relações OSM
- Pontos (cluster < 15 m), shapes (OSM ou Valhalla), stop_times estimados (`timepoint=0`)
- Calendário (`holidays` ES + municipais em YAML + férias)
- GTFS Validator no CI bloqueando erro; detector de mudanças diário + aliases
- Aquaviário como `route_type=4`

### Fase 2: Motor de rotas (prioridade 1)
- Formato binário do timetable + hops + perfis, hash, compressão, assinatura Ed25519
- McRAPTOR com Pareto (chegada, baldeações, caminhada), janela de 60 min
- Overlay de fatores por trecho (faixa exclusiva, chuva, incidente, via bloqueada), FIFO
- Diversidade por penalização de corredor; integração tarifária vinda de `tarifas.yaml`
- Ranking p50/p90 + risco de baldeação; rótulos; motivos estruturados
- Cenários de ouro (§4.7) como testes, primeiro sobre uma **rede de teste sintética marcada como fictícia** (só em `fixtures/`, nunca empacotada), depois sobre o GTFS real
- Benchmarks com 400 linhas

### Fase 3: App PWA offline (prioridade 2 e 3)
- Mapa MapLibre + PMTiles (básico ≤ z14 e detalhado z15–16, tamanhos medidos)
- Busca offline (MiniSearch, sem acento, sinônimos, aliases de linha)
- Planejador, resultado com explicações, horários e itinerários
- Central Offline, `storage.persist()`, OPFS, verificação de assinatura
- Metas de desempenho medidas também com CPU 4x e perfil de aparelho de entrada (Lighthouse CI)

### Fase 4: Android (Capacitor)
- Build Android, plugins oficiais, `TileStore`/`DataStore` com Filesystem
- Modo viagem com serviço em primeiro plano, alerta de desembarque (geofence + vibração)
- **Validação no Poco X7 Pro (HyperOS) via adb**: viagem ativa e alerta com a tela desligada e o app em segundo plano
- Tela que orienta a liberar a otimização de bateria / início automático no HyperOS
- APK de debug como artefato do CI

### Fase 5: Backend de tempo real
- Provedores `tabela`, `simulador`, `colaborativo` (token efêmero, map matching, apagar brutos em 24 h), `gtfs_rt` (sem feed), stub `oficial` desligado
- Fusão com prioridade, suavização e confiança; SSE de deltas a cada 60 s
- UI mostrando fonte e idade do dado

### Fase 6: Trânsito, incidentes e clima
- Open-Meteo (atribuição CC BY 4.0)
- Relatos de usuários com expiração e peso por confirmação
- PRF (histórico de acidentes, informativo)
- TomTom/HERE com `ProviderBudget` **somente após sua autorização e chave**
- Re-roteamento e "Saia agora"; planejar para depois

### Fase 7: Lotação, polimento e publicação
- Lotação por relatos + histórico (3 níveis); câmeras da Terceira Ponte como link com atribuição
- Acessibilidade, animações, tablet/desktop
- Deploy (Cloudflare Pages/R2, VPS/Fly) e Play Store: **[PERGUNTAR]** antes de criar qualquer conta ou recurso

## 4. Riscos principais

| Risco | Impacto | Mitigação |
|---|---|---|
| Sem GTFS oficial; site da Ceturb pode mudar ou proibir coleta | Alto | Coletor isolado atrás de adaptador, cache, OSM como segunda fonte, overrides manuais; validar termos antes de coletar |
| Tempos intermediários estimados divergirem da operação | Alto | `timepoint=0`, rótulo "estimado", recalibrar com sonda colaborativa |
| Rede mudando (renumeração de Vila Velha) | Médio | Detector de mudanças diário + aliases versionados |
| HyperOS matando o serviço da viagem ativa | Alto | Foreground service, teste no aparelho real, tela de orientação de bateria |
| MapLibre GL JS pesado no WebView em aparelho de entrada | Médio | Medir com throttling; plano B documentado (MapLibre Native) |
| Cotas/termos de TomTom/HERE (armazenamento) | Médio | Ler termos antes; histórico só da sonda e relatos se proibido |
| Open-Meteo grátis é não comercial | Baixo | Registrar no ADR de fontes; trocar se monetizar |
| Tamanho dos pacotes offline | Médio | PMTiles em dois níveis, timetable compacto, medir e exibir tamanho |
| Container de nuvem efêmero (commits só locais se perdem) | Médio | Ver pergunta sobre push no branch de trabalho |
