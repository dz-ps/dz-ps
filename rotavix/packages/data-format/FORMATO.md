# Formato `.rvx` (pacote de rede), versão 1

Escritor único: `pipeline/rotavix_pipeline/rvx.py`. Leitor: `src/index.ts`.
Objetivo: abrir o pacote no cliente sem parse (views de typed arrays direto sobre o `ArrayBuffer`).

## Layout

| Offset            | Tamanho | Conteúdo                                                         |
| ----------------- | ------- | ---------------------------------------------------------------- |
| 0                 | 4       | magic `RVX1`                                                     |
| 4                 | 4       | `u32` LE: tamanho N do cabeçalho JSON                            |
| 8                 | N       | cabeçalho JSON UTF-8, depois zeros até múltiplo de 8             |
| D = alinhar8(8+N) | …       | área de dados: seções little-endian, cada uma alinhada a 8 bytes |

Cada seção é descrita em `cabecalho.secoes[nome] = { tipo, offset, n }` (`offset` relativo a D; `n` elementos).
Tipos: `f32`, `i32`, `u32`, `u16`, `u8`.

## Cabeçalho

- `rede`: `nome`, `sintetica` (bool; o app mostra aviso quando `true`), `fonte`, `versao_feed`
- `fuso`: fuso IANA da rede
- `pontos`: `ids[]`, `nomes[]` (índice = id interno do ponto)
- `linhas[]`: `id`, `curta`, `longa`, `tipo` (GTFS `route_type`), `servico` (`troncal`, `alimentadora`, `aquaviario`, `expresso`, `municipal`, `outro`), `cor`
- `padroes[]`: `linha`, `destino`, `sentido`. Padrão = sequência fixa de pontos de uma linha; viagens FIFO (sem ultrapassagem)
- `servicos[]`: `id`, `dias[7]` (seg..dom), `inicio`, `fim` (`AAAAMMDD`), `add[]`, `rem[]` (exceções)
- `caminhada`: método e parâmetros das transferências a pé (estimativa)
- `scoring`: cópia de `config/scoring.yaml`

## Seções

| Seção                                | Tipo | Tamanho | Significado                                                                          |
| ------------------------------------ | ---- | ------- | ------------------------------------------------------------------------------------ |
| `ponto_lat`, `ponto_lon`             | f32  | S       | coordenadas                                                                          |
| `padrao_linha`                       | u32  | P       | índice em `linhas`                                                                   |
| `padrao_pontos_ini`                  | u32  | P+1     | início de cada padrão em `padrao_pontos`                                             |
| `padrao_pontos`                      | u32  | Σ       | sequência de pontos                                                                  |
| `padrao_viagens_ini`                 | u32  | P+1     | início das viagens de cada padrão (índice global de viagem)                          |
| `padrao_tempos_ini`                  | u32  | P+1     | início dos horários do padrão em `chegada`/`partida`                                 |
| `viagem_servico`                     | u16  | T       | índice em `servicos`                                                                 |
| `chegada`, `partida`                 | i32  | Σ       | segundos desde a meia-noite do dia de serviço; viagem-major: `ini + v*nPontos + pos` |
| `ponto_padroes_ini`                  | u32  | S+1     | padrões que passam em cada ponto                                                     |
| `ponto_padroes`, `ponto_padroes_pos` | u32  | Σ       | padrão e posição do ponto nele                                                       |
| `transf_ini`                         | u32  | S+1     | transferências a pé saindo de cada ponto                                             |
| `transf_para`                        | u32  | Σ       | ponto de destino                                                                     |
| `transf_s`                           | u16  | Σ       | segundos a pé (estimativa)                                                           |

## Evolução

Campos novos no cabeçalho não quebram leitores. Seções novas idem. Mudança de layout incrementa `versao`
e o magic continua `RVX1` até a versão 9. Assinatura Ed25519 e compressão ficam no manifest (Fase 1).
