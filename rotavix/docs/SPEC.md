# Prompt para o Claude Code: RotaVix, app de ônibus da Grande Vitória

> Nome provisório: **RotaVix**. Centralize nome, ícone e paleta em um único arquivo (`apps/app/src/brand.ts`) para eu trocar depois.
>
> Como usar: salve este arquivo como `docs/SPEC.md` no repositório e diga ao Claude Code: "Leia docs/SPEC.md inteiro e siga a seção 0."

---

## 0. Como você deve trabalhar

Você é o engenheiro líder (mobile, web, backend e dados) deste projeto. Regras:

1. Leia este documento inteiro antes de escrever qualquer código.
2. Comece planejando: crie `docs/PLANO.md` com arquitetura, árvore de pastas, as fases da seção 11 quebradas em tarefas e os principais riscos. Depois implemente fase por fase sem pedir aprovação a cada passo, exceto nos pontos marcados **[PERGUNTAR]**.
3. Crie um `CLAUDE.md` enxuto: comandos (dev, build, test, lint), convenções e mapa das pastas. Não copie esta SPEC para dentro dele.
4. Decisões importantes viram ADR curto em `docs/adr/NNNN-titulo.md`.
5. **Nunca invente dados da rede** (linhas, horários, tarifas, regras de integração). O que não der para confirmar vira configuração com `TODO(VERIFICAR)`.
6. Commits pequenos no padrão Conventional Commits. Ao fim de cada fase: testes passando, `docs/DEMO-faseN.md` com o roteiro para eu validar no celular e a lista do que ficou pendente.
7. Pergunte só quando estiver bloqueado ou antes de qualquer coisa que gere custo ou crie conta (serviço pago, chave de API, publicação em loja). Fora isso, decida, documente e siga.

---

## 1. Produto

App no estilo Moovit para a Grande Vitória (ES): Vitória, Vila Velha, Serra, Cariacica, Viana, Guarapari e Fundão. Cobre o Sistema Transcol (incluindo as linhas municipais já integradas a ele) e o Aquaviário.

Diferenciais, em ordem de importância:

1. **Rotas que fogem do trânsito e de acidentes.** O ranking considera trânsito atual e típico do horário, incidentes, chuva, faixas exclusivas de ônibus e o risco de perder baldeação. Toda opção explica por que foi escolhida.
2. **Offline de verdade.** Mapa, busca, horários, itinerários e planejamento de rota funcionando em modo avião.
3. **Tempo real e lotação plugáveis.** Arquitetura de provedores que aceita fonte oficial (quando houver autorização), GTFS-Realtime, dados colaborativos e simulador.
4. **Interface bonita, rápida e responsiva** em celular, tablet e desktop.
5. **Um código, duas entregas:** PWA instalável e app Android publicado na Play Store.

O app é **independente e não oficial**. Não use nomes, logos ou identidade visual de Transcol, GVBus, Ceturb, Semobi ou Ônibus GV de forma que pareça oficial. Mostre um aviso discreto: "App independente. Horários e posições podem divergir; confira os canais oficiais."

---

## 2. Contexto do domínio

- A **Ceturb-ES** planeja e fiscaliza o Transcol; o **GVBus** é o sindicato das operadoras; o app oficial é o **Ônibus GV**.
- Escala: rede da ordem de **400 linhas** e milhares de pontos. Dimensione estruturas e metas de desempenho para isso.
- **Tarifa única** com integração nos terminais, integrações temporais em algumas regiões (já existiram janelas de 30 min, 1 h e 1 h 30) e Aquaviário na mesma tarifa. Valor vigente: R$ 5,10 (desde 11/01/2026). Modele tudo isso como dados em `config/tarifas.yaml`, nunca no código.
- **A rede muda com frequência.** Na virada de outubro para novembro de 2026, cerca de 30 linhas municipais de Vila Velha passaram para o Transcol com **números novos** (ex.: 001 virou 678) e a integração segue gradual. Mantenha uma tabela de **aliases** (número antigo para novo): buscar "001" deve levar à 678 com o aviso "agora é 678".
- **Aquaviário:** 4 estações hoje (Porto de Santana em Cariacica, Prainha em Vila Velha, Praça do Papa e Rodoviária em Vitória), com novas estações em obra. Modele como balsa/barca (`route_type = 4` no GTFS). É alternativa real quando a Terceira Ponte trava.
- **Prioridade para ônibus:** a Terceira Ponte tem faixa exclusiva e existe o corredor ExpressoGV com faixa exclusiva e estações. Ônibus nesses trechos sofrem menos com o trânsito dos carros, e o modelo precisa saber disso.
- **Horários publicados** são, em geral, horários programados de saída e podem não bater com a operação real. Os tempos nos pontos intermediários terão de ser estimados.
- **Calendário:** dia útil, sábado, domingo/feriado, feriados nacionais, estaduais e municipais, e quadros de férias escolares.
- **Gargalos conhecidos** (exemplos para testes, não para hardcode): pontes da ilha de Vitória (Terceira Ponte, Segunda Ponte, Florentino Avidos e outras), BR-101 na Serra, Rodovia do Sol, Reta da Penha, Av. Fernando Ferrari, Rodovia Darly Santos. Derive pontes e corredores do OSM e dos dados das linhas.
- **Glossário:** troncal (terminal a terminal), alimentadora (bairro a terminal), terminal de integração, integração temporal, quadro de horários.

---

## 3. Fontes de dados

**Situação atual:** não encontrei GTFS nem GTFS-Realtime oficial público do Transcol, nem API aberta documentada do Ônibus GV. Vou pedir acesso formal (Ceturb via LAI/SIC, GVBus e Geocontrol, fornecedora do Ônibus GV). Até lá, construa tudo sobre **adaptadores** e avance com fontes públicas, dados colaborativos e simulador.

### Regras inegociáveis

- **Não faça engenharia reversa do app Ônibus GV**, não consuma endpoints privados ou não documentados e não contorne autenticação, certificate pinning, captcha ou rate limit de ninguém.
- Fontes públicas (site da Ceturb, OSM, PRF): respeite robots.txt e termos, identifique o User-Agent com e-mail de contato, use cache agressivo e baixa frequência. Registre fonte, licença, atribuição e frequência em `docs/FONTES_DE_DADOS.md`.
- **Chaves de API nunca vão para o cliente.** Todo provedor pago ou com cota passa por proxy no backend, com cache e orçamento.

### 3.1 Dados estáticos (GTFS)

Pipeline em Python que gera um **GTFS válido** da rede.

- **Fontes, em ordem de preferência:** (1) GTFS oficial, se a Ceturb fornecer; (2) linhas, horários e itinerários públicos do site da Ceturb (o repositório `github.com/Skippern/GV-scraper` serve de referência de como isso já foi coletado, mas pode estar desatualizado); (3) relações de rotas de ônibus do OpenStreetMap, no modelo osm2gtfs; (4) correções manuais versionadas em `data/overrides/*.yaml`.
- **Pontos:** deduplicar (cluster < 15 m), nome, sentido e acessibilidade quando houver.
- **Shapes:** relação OSM quando existir; senão, rotear a sequência de pontos com perfil de ônibus (Valhalla) e conferir contra a lista de ruas do itinerário.
- **stop_times:** horários de saída oficiais + tempos intermediários estimados (`timepoint = 0`) a partir de perfis de velocidade por faixa horária, recalibrados quando houver dados de tempo real.
- **Calendário:** biblioteca `holidays` (subdivisão ES) + feriados municipais em YAML + variantes de férias.
- **Validação:** MobilityData GTFS Validator no CI; erro bloqueia o build.
- **Detector de mudanças diário:** compara com a versão anterior e gera relatório (linhas novas, extintas, renumeradas, horários alterados), atualizando a tabela de aliases.

### 3.2 Tempo real (posição dos ônibus e previsão de chegada)

Interface de provedor no backend com estas implementações:

| Provedor | O que faz | Estado inicial |
|---|---|---|
| `gtfs_rt` | Consome GTFS-Realtime padrão (VehiclePositions, TripUpdates, ServiceAlerts). Alvo preferido de qualquer integração oficial. | Pronto, sem feed configurado |
| `oficial` | Stub com contrato definido para uma API de parceiro (Ceturb/GVBus/Geocontrol). Só é implementado com documentação e autorização por escrito. | Feature flag desligada. **[PERGUNTAR]** |
| `colaborativo` | Modo opt-in "Estou neste ônibus": durante a viagem ativa o celular envia GPS a cada 5 a 10 s; o servidor faz map matching no shape, gera a posição do veículo e mede velocidade por trecho. | Ligado (opt-in) |
| `tabela` | Posição estimada pelos horários, sempre rotulada como estimativa e com visual diferente. | Ligado |
| `simulador` | Ônibus andando nos shapes com atrasos e ruído realistas, para desenvolvimento, testes e demos. | Só em dev/demo |

- **Fusão:** prioridade oficial > GTFS-RT > colaborativo > tabela; suavização (alpha-beta ou Kalman simples), confiança por fonte e idade do dado.
- **Privacidade do colaborativo:** token efêmero por viagem, sem conta obrigatória, pontos brutos apagados em até 24 h, só agregados persistem.
- A UI **sempre** mostra origem e idade do dado: "Ao vivo há 20 s", "Pela tabela", "Sem sinal há 3 min".

### 3.3 Lotação e câmeras

- `OccupancyProvider` com: nível oficial (se autorizado), relatos dos usuários ("Vazio", "Em pé", "Lotado") e estimativa histórica por linha e faixa horária. Normalize para o enum `OccupancyStatus` do GTFS-RT e mostre 3 níveis na UI.
- **Imagens internas dos ônibus ficam fora do escopo por padrão.** Imagem de passageiro é dado pessoal (LGPD). Se um dia houver integração oficial, exiba só o nível de lotação; imagem, apenas via URL/embed oficial, sem armazenar, sem cache, sem processar rostos e com aviso de origem. Feature flag desligada. **[PERGUNTAR]**
- **Câmeras de trânsito públicas:** a Ceturb publica câmeras da Terceira Ponte em `https://terceiraponte.ceturb.es.gov.br/`. Integre como link/aba de navegador dentro do app, com atribuição ("Imagens: Ceturb-ES"). Embutir imagem direto só com permissão ou feed documentado.

### 3.4 Trânsito, incidentes e clima

`TrafficProvider` e `IncidentProvider` no backend, com cache, orçamento mensal e degradação graciosa.

- **TomTom** (para começar): Traffic Flow (segment data e vector tiles) e Traffic Incidents. A cota grátis é mensal por API; implemente `ProviderBudget` (cota, margem de 80%, alerta e corte automático ao se aproximar do limite).
- **HERE Traffic API v7** como segunda fonte ou alternativa.
- **Não use Google Maps Platform para rotas ou trânsito.** Os termos proíbem usar conteúdo de rotas junto com mapa que não seja do Google, e o nosso mapa é OSM/MapLibre.
- **Sonda de ônibus:** velocidade por trecho medida pelos próprios ônibus (oficial ou colaborativo). É a melhor fonte, porque já embute faixa exclusiva, paradas e semáforos.
- **Relatos dos usuários:** acidente, trânsito parado, alagamento, ônibus quebrado, ônibus não passou. Expiram sozinhos, ganham peso com confirmações e perdem com negações.
- **Histórico de acidentes:** dados abertos da PRF (CSV de acidentes em rodovias federais, ex.: BR-101 na Serra) para mapa de pontos críticos e risco por horário. Informativo, não é tempo real.
- **Clima:** Open-Meteo (chuva atual e prevista) como fator no modelo. A API grátis é só para uso não comercial e exige atribuição CC BY 4.0; se o app for monetizado, troque para o plano pago ou self-host. Registre isso no ADR de fontes.
- **Termos de armazenamento:** verifique e documente o que TomTom e HERE permitem guardar. Se não puder montar histórico com dados deles, o histórico vem só da sonda de ônibus e dos relatos.
- **Waze:** o Waze for Cities só atende órgãos públicos; não conte com ele.

### 3.5 Mapa, busca e caminhada

- **Mapa:** base OSM em tiles vetoriais **PMTiles** (Protomaps) recortados para a região (bbox dos pontos + 2 km). Dois pacotes: básico (até z14) e detalhado (z15 e z16). Meça e mostre o tamanho de cada um.
- **Busca offline:** índice local (MiniSearch ou FlexSearch) de pontos, terminais, estações, bairros e POIs do OSM (escolas, hospitais, shoppings, universidades), com normalização sem acento e sinônimos (T. = Terminal, Av. = Avenida, VV = Vila Velha, Vix = Vitória) e aliases de linhas.
- **Busca online:** geocodificador self-hosted (Photon com extrato do ES) atrás do backend. Não use o Nominatim público para autocomplete.
- **Caminhada:** transferências entre pontos pré-calculadas no ETL com o grafo de pedestres do OSM; acesso de origem e destino online via Valhalla (perfil pedestre); offline, distância em linha reta × 1,3, rotulada como estimativa.

---

## 4. Motor de rotas com trânsito (o coração do app)

Um único motor em TypeScript, rodando no cliente dentro de um Web Worker (Comlink). Funciona igual online e offline; online ele só recebe dados mais frescos.

### 4.1 Dados do motor

- **Timetable compacto** em typed arrays (padrões de rota × viagens × paradas), gerado no ETL, versionado por hash, comprimido (brotli/gzip) e **assinado com Ed25519** (verificação no cliente via WebCrypto ou `@noble/ed25519`).
- **Trechos (hops):** cada par de paradas consecutivas mapeado para vias do OSM (map matching no ETL), com comprimento, perfil de velocidade base em faixas de 15 min (dia útil, sábado, domingo), fração com faixa exclusiva, flag de ponte e flags de risco.
- **Perfis históricos** em formato compacto (ex.: `uint8` por trecho e faixa horária, ou agrupado por corredor) dentro do pacote offline.

### 4.2 Overlay dinâmico (antes de rotear)

Para as viagens das próximas 3 h, calcule horários ajustados em cada parada:

- Se houver ETA em tempo real, use.
- Senão: horário de saída + soma dos tempos de trecho ajustados + tempo de parada (dwell) por faixa horária.
- **Tempo de trecho** = comprimento ÷ velocidade efetiva do ônibus, com a velocidade vindo, nesta ordem: sonda de ônibus recente > fluxo do provedor (atenuado pela fração de faixa exclusiva) > perfil histórico > tabela.
- **Fatores multiplicativos:** chuva, incidente no trecho (por severidade), via bloqueada (trecho inviável).
- Garanta **FIFO** por padrão de rota (sem ultrapassagem) ou trate ultrapassagens separando padrões.
- O servidor envia só **fatores de congestionamento por trecho** (deltas compactos a cada 60 s via SSE) e o cliente aplica. Isso mantém o tempo real leve em dados móveis.

### 4.3 Geração de candidatos

- **McRAPTOR** (ou rRAPTOR com fronteira de Pareto) sobre o timetable ajustado. Critérios: chegada, número de baldeações e caminhada. Janela de partida de 60 min.
- **Diversidade:** depois da melhor opção, penalize os corredores mais congestionados que ela usa e rode de novo, para garantir alternativas reais (outra ponte, Aquaviário, outra troncal).
- **Integração tarifária:** respeite terminal gratuito e janelas temporais; opção que estoura a janela mostra o custo extra.

### 4.4 Ranking com incerteza

- Para cada candidato, estime a distribuição da chegada (**p50 e p90**) usando a variância por trecho do histórico e o **risco de perder a baldeação** (probabilidade de chegar depois da partida menos o tempo mínimo de transferência, vezes o headway da próxima).
- **Score padrão** = p90 da chegada + penalidades configuráveis em `config/scoring.yaml`.
- **Rótulos:** "Mais rápida", "Mais confiável", "Menos baldeação", "Menos lotada", "Desvia do trânsito".
- **Explicabilidade obrigatória**, gerada a partir dos dados. Exemplos: "Evita a Terceira Ponte (lentidão de +18 min, acidente às 17:32)", "Aquaviário Prainha → Praça do Papa: 11 min mais rápido agora", "Baldeação apertada: 25% de chance de perder a próxima".

Valores iniciais (calibrar com dados reais e documentar no ADR):

```yaml
# config/scoring.yaml
objetivo_padrao: p90_chegada
penalidade_baldeacao_min: 3
peso_caminhada: 1.5
peso_espera: 1.2
transferencia_minima_min: 2
faixa_exclusiva_repasse_atraso: 0.3   # fração do atraso dos carros que chega ao ônibus na faixa
chuva:
  moderada_fator: 1.10
  forte_fator: 1.25
incidente_atraso_min: { leve: 3, moderado: 8, grave: 20 }
via_bloqueada: inviavel
lotacao_penalidade_min: { em_pe: 2, lotado: 6 }   # só quando "evitar lotação" estiver ligado
```

### 4.5 Durante a viagem

- **Modo viagem:** passo a passo, "faltam 3 paradas", alerta de desembarque (geofence + vibração), ônibus ao vivo.
- **Re-roteamento:** se surgir opção bem melhor (ex.: incidente à frente), avisar "Desça no Terminal X e pegue a linha Y".
- **"Saia agora":** notificação baseada na previsão de chegada do ônibus no ponto do usuário.

### 4.6 Planejar para depois

"Sair às 7h amanhã": usa perfil histórico + previsão do tempo e mostra a faixa provável de chegada.

### 4.7 Cenários de ouro (testes que precisam dar resultado plausível e explicado)

1. Prainha (Vila Velha) → Enseada do Suá (Vitória) com a Terceira Ponte travada: oferecer Aquaviário ou rota por outra ponte, com explicação.
2. Terminal Laranjeiras (Serra) → Praia do Canto (Vitória) no pico da manhã com chuva forte.
3. Jacaraípe (Serra) → UFES (Goiabeiras) com acidente simulado na BR-101.
4. Campo Grande (Cariacica) → Rodoviária de Vitória em modo avião (só dados offline).
5. Busca pelo número antigo de uma linha de Vila Velha (001) leva à linha nova (678).

---

## 5. Arquitetura técnica

```
rotavix/
  apps/
    app/           # React + TS + Vite: PWA e Android (Capacitor) do mesmo código
    api/           # FastAPI: tempo real, proxy de trânsito, relatos, push, manifest de pacotes
  packages/
    router/        # McRAPTOR + overlay + ranking (TS puro, sem UI)
    data-format/   # schema dos pacotes binários (FlatBuffers ou formato próprio documentado)
    ui/            # design system
  pipeline/        # ETL Python: GTFS, hops, perfis, índice de busca, PMTiles
  infra/           # docker compose: Postgres/PostGIS, Redis, Valhalla, Photon
  config/          # tarifas.yaml, scoring.yaml, feature flags
  docs/
```

- **Frontend:** React e TypeScript (strict) nas versões estáveis mais recentes, Vite, TanStack Router e TanStack Query, Zustand, Dexie (IndexedDB), MapLibre GL JS + PMTiles, Tailwind CSS + Radix UI (ou shadcn/ui), Motion para animações, Comlink, vite-plugin-pwa (Workbox, estratégia injectManifest).
- **Android:** Capacitor (estável mais recente) com plugins oficiais (Geolocation, Filesystem, Preferences, Network, Haptics, Local e Push Notifications via FCM, Share). Se o MapLibre GL JS no WebView ficar pesado em aparelho de entrada, deixe documentada a troca por MapLibre Native via plugin.
- **Backend:** Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 + asyncpg, PostgreSQL + PostGIS, Redis, workers assíncronos (arq, SAQ ou Taskiq), httpx, SSE para tempo real.
- **ETL:** Python, polars, partridge ou gtfs-kit, osmium, Valhalla (map matching e roteamento), GTFS Validator; execução diária agendada.
- **Infra:** Docker Compose em dev; PWA no Cloudflare Pages; pacotes de dados no Cloudflare R2 com manifest versionado (versão, sha256, tamanho, assinatura); backend em VPS ou Fly.io atrás do Cloudflare. **[PERGUNTAR]** antes de criar qualquer recurso pago.
- **CI (GitHub Actions):** ESLint e Ruff, tsc e pyright, testes, GTFS Validator, Lighthouse CI, APK de debug como artefato.

Contratos (ajuste o que precisar, mas mantenha a ideia):

```python
class RealtimeProvider(Protocol):
    id: str
    async def stream(self) -> AsyncIterator[VehicleState]: ...
    async def health(self) -> ProviderHealth: ...  # idade do último dado, cobertura, erros

class TrafficProvider(Protocol):
    id: str
    async def flow(self, bbox: BBox) -> list[SegmentSpeed]: ...
    async def incidents(self, bbox: BBox) -> list[Incident]: ...

class OccupancyProvider(Protocol):
    id: str
    async def current(self, trip_or_vehicle_id: str) -> OccupancyReading | None: ...
```

```ts
type Fonte = 'oficial' | 'gtfs_rt' | 'colaborativo' | 'tabela' | 'simulador';

type VehicleState = {
  vehicleId: string;
  lineId: string;
  tripId?: string;
  lat: number;
  lon: number;
  bearing?: number;
  speedKmh?: number;
  ts: number;          // epoch ms
  source: Fonte;
  confidence: number;  // 0..1
  occupancy?: { status: OccupancyStatus; source: string; ts: number };
};
```

---

## 6. Offline-first

- **Pacotes:** app shell (precache), timetable + hops + perfis, índice de busca, mapa básico; mapa detalhado opcional.
- **Central Offline:** tamanho de cada pacote, data da última atualização, "atualizar só no Wi-Fi", baixar de novo, apagar.
- **PWA:** Workbox, `navigator.storage.persist()`, arquivos grandes no OPFS, fila de relatos com reenvio ao reconectar (Background Sync quando existir).
- **Android:** mesmos pacotes no armazenamento do app via Capacitor Filesystem. Abstraia com `TileStore` e `DataStore` para os dois

<!--
NOTA DO ENGENHEIRO (2026-11-15): o texto recebido termina exatamente aqui, no meio da seção 6.
As seções 7 em diante (incluindo a 11, com as fases, e a 13, com o formato de resposta)
não chegaram. Cole o restante abaixo desta nota para completar a SPEC.
-->
