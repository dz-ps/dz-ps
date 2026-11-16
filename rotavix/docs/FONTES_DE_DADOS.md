# Fontes de dados

Registro obrigatório de cada fonte: origem, licença, atribuição, frequência de acesso e status.
User-Agent padrão: `RotaVix-pipeline/0.1`, com `(+contato)` quando `RV_CONTATO` estiver definido. Por decisão do dono do projeto (2026-11-16), ainda sem e-mail; usar a URL do repositório quando ele for público.

| Fonte                                          | Uso                                | Licença / termos                                     | Atribuição                         | Frequência                | Status                                    |
| ---------------------------------------------- | ---------------------------------- | ---------------------------------------------------- | ---------------------------------- | ------------------------- | ----------------------------------------- |
| GTFS oficial Ceturb                            | GTFS                               | a obter (LAI/SIC)                                    | a definir                          | —                         | aguardando                                |
| Site da Ceturb (linhas, horários, itinerários) | GTFS                               | TODO(VERIFICAR) termos e robots.txt antes de coletar | "Dados: Ceturb-ES"                 | diária, baixa taxa        | autorizado pelo dono (2026-11-16); Fase 1 |
| OpenStreetMap                                  | mapa, rotas, pedestres, POIs       | ODbL 1.0                                             | "© colaboradores do OpenStreetMap" | diária (Geofabrik)        | não iniciado                              |
| Protomaps (build diário, build.protomaps.com)  | mapa base (recorte via HTTP Range) | ODbL (dados OSM)                                     | "© OpenStreetMap · Protomaps"      | sob demanda (`pnpm data`) | **em uso** (Fase 0)                       |
| Protomaps basemaps-assets (GitHub)             | fontes e sprites do mapa           | OFL (Noto Sans); ver repositório                     | idem                               | sob demanda               | **em uso** (Fase 0)                       |
| Rede sintética (`pipeline/fixtures/sintetico`) | testes e demo da Fase 0            | própria                                              | marcada como fictícia no app       | —                         | **em uso** (Fase 0)                       |
| PRF dados abertos (acidentes)                  | histórico de risco                 | TODO(VERIFICAR)                                      | "Fonte: PRF"                       | mensal                    | não iniciado                              |
| Open-Meteo                                     | chuva                              | grátis só não comercial; CC BY 4.0                   | "Weather data by Open-Meteo.com"   | 15 min, cache             | não iniciado                              |
| TomTom Traffic                                 | fluxo e incidentes                 | TODO(VERIFICAR) termos de armazenamento              | conforme termos                    | com orçamento             | **[PERGUNTAR]** conta/chave               |
| HERE Traffic v7                                | fluxo e incidentes                 | TODO(VERIFICAR)                                      | conforme termos                    | com orçamento             | **[PERGUNTAR]** conta/chave               |
| Câmeras Terceira Ponte (Ceturb)                | link no app                        | site público                                         | "Imagens: Ceturb-ES"               | sob demanda (link)        | não iniciado                              |

Fora de cogitação: engenharia reversa do Ônibus GV, endpoints privados, Google Maps Platform para rotas/trânsito, Nominatim público para autocomplete.
