# 0003. Motor de rotas no cliente e pacote binário `.rvx`

Data: 2026-11-16 · Status: aceito

## Contexto

A SPEC exige o mesmo roteamento online e offline (§4), com a meta de < 700 ms (p95) em aparelho de entrada (§7).
Parse de JSON/CSV de uma rede de ~400 linhas no celular custa segundos e muita memória.

## Decisão

- **McRAPTOR em TypeScript** (`packages/router`), rodando num Web Worker via Comlink. Critérios de Pareto:
  chegada, número de viagens e tempo a pé. A janela de 60 min é coberta repetindo a busca a partir da próxima partida.
- **Formato próprio `.rvx`** (`packages/data-format/FORMATO.md`) em vez de FlatBuffers: cabeçalho JSON pequeno +
  seções de typed arrays alinhadas, lidas sem cópia. O pipeline Python é o único escritor; um teste de contrato
  compara o leitor TS com o arquivo gerado pelo Python, e o CI exige que a fixture regenerada seja idêntica.
- Viagens agrupadas em **padrões FIFO** (sem ultrapassagem); padrões com ultrapassagem são separados no ETL.
- Explicações são **motivos estruturados** gerados pelo motor; o texto em PT-BR sai de `explicar()`.
- Caminhada offline: linha reta × 1,3 a 1,2 m/s, sempre rotulada como estimativa (§3.5).

## Consequências

- Medido com CPU 4x mais lenta (Playwright + CDP): ~15 ms por planejamento na rede sintética. A medição com a rede real
  entra na Fase 1, com o mesmo teste (`e2e/desempenho.spec.ts`).
- Ainda não tratado: viagens do dia de serviço anterior que passam da meia-noite (> 24:00), p50/p90 e overlay de trânsito (Fase 2).
