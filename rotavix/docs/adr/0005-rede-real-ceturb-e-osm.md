# 0005. Rede real: horários da Ceturb + pontos e trajetos do OpenStreetMap

Data: 2026-11-16 · Status: aceito

## Contexto

Não existe GTFS oficial público do Transcol. O portal de dados abertos do ES (dados.es.gov.br, CC0) tem só
rótulos de linhas e regras de integração. O portal público de horários (transcol.ceturb.es.gov.br) é uma
aplicação Blazor: o próprio site faz um login anônimo e busca os dados numa API interna, sem documentação.
O portal lista ruas do itinerário, mas não traz coordenadas de pontos.

## Decisão

- **Horários**: o coletor (`pipeline/coletores/ceturb_transcol.mjs`) abre as páginas públicas num navegador,
  como qualquer pessoa, e lê a área de impressão do quadro de horários. **Não chama a API interna diretamente**
  (SPEC §3: nada de endpoints não documentados). Ritmo de ~1 linha a cada 4 s, uma coleta por dia no máximo.
- **Pontos e trajetos**: relações de rota de ônibus do OpenStreetMap (extrato do ES em download.openstreetmap.fr).
- **Cruzamento** por número da linha **e** semelhança de nome (Jaccard ≥ 0,2). Sentido associado pela "saída".
- **Controles de qualidade** (linha fica fora do roteamento e vai para `data/build/gtfs-real/relatorio.json`):
  sem relação no OSM; pontos fora de ordem (cadeia > 3,5× o alcance); duração estimada > 150 min às 10h.
- **Horários nos pontos intermediários são estimados** (`timepoint=0`) pela distância no trajeto e por velocidades
  por faixa horária (`config/velocidades.yaml`, TODO calibrar). O app mostra "≈" e explica na rota.
- **Feriados** usam o quadro de domingo (`config/calendario.yaml`). Evidência: o portal mostrou a sexta 20/11/2026
  (Consciência Negra) com o quadro de domingo. Feriados municipais: TODO(VERIFICAR).

## Consequências

- Coleta de 16/11/2026: 416 linhas no portal; **209 roteáveis** (24.010 viagens, 2.947 pontos);
  170 sem rota no OSM, 32 com pontos fora de ordem e 5 com duração implausível.
- Para cobrir as demais: completar as relações no OSM (contribuição aberta) ou montar o trajeto pela lista de
  ruas do itinerário da Ceturb com Valhalla (SPEC §3.1). Fonte oficial (GTFS) resolveria tudo.
- Aquaviário ainda não entrou (há página própria no portal).
