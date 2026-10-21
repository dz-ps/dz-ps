# Decisões técnicas

Registro de cada decisão técnica relevante e o motivo. Mais recentes no fim.

## D0. Local do código: pasta `riftbuild/` no repo do perfil (provisório)

- **Decisão:** o código vive em `dz-ps/dz-ps/riftbuild/`, na branch `claude/inspiring-hamilton-9jhew7`.
- **Motivo:** o plano era um repo novo `dz-ps/riftbuild`, mas a integração do GitHub desta sessão não tem permissão para criar repositórios (403). A pasta é autocontida (tem `.github/workflows` próprios, que só passam a rodar quando ela virar a raiz de um repo).
- **Para mover:** criar o repo vazio e rodar `git subtree split --prefix=riftbuild -b riftbuild-only` e dar push dessa branch como `main` do repo novo. O histórico é preservado.

## D1. Uma única implementação das regras em `packages/shared`

- TypeScript puro, imports relativos com extensão `.ts`, única dependência: zod.
- O ESLint proíbe `process`, `Buffer`, `node:*`, React e Expo dentro do shared.
- **Motivo:** o spec (§6.5) exige que a validação da IA use o mesmo código do criador de build. O mesmo arquivo roda no app (Metro/Jest), nas evals (Vitest/Node) e nas Edge Functions (Deno).

## D2. Deno recebe uma cópia gerada do shared

- `scripts/sync-shared-to-deno.mjs` copia `packages/shared/src` para `supabase/functions/_shared/riftbuild-shared/` e escreve o import map do zod em `supabase/functions/deno.json`.
- O CI roda `pnpm sync:deno --check` e falha se a cópia divergir.
- **Motivo:** o deploy de Edge Functions só empacota a pasta `functions/` de forma confiável. Uma cópia commitada deixa o deploy reproduzível e a mudança visível no diff. Publicar o shared no npm/JSR seria custo sem ganho.

## D3. IDs estáveis: slug snake_case do nome em inglês

- Ex.: `kaisa`, `dr_mundo`, `jarvan_iv`, `nashors_tooth`.
- Python e TypeScript implementam a mesma regra e rodam os mesmos casos (`contracts/cases/slugify.json`).

## D4. Pydantic é a fonte da verdade dos pacotes publicados; zod é a das respostas da IA

- O pipeline exporta JSON Schema dos modelos pydantic para `contracts/schema/`, commitado; o CI checa se mudou.
- O zod espelha à mão (tipos idiomáticos no app). Testes de contrato com as mesmas fixtures nos dois lados e um teste de divergência estrutural.
- O pipeline só publica depois de validar o pacote com o zod real.

## D5. Catálogo offline: manifest + pacotes imutáveis endereçados por hash

- `manifest.json` (Storage público) aponta para `catalog/<patch>/<hash>.json.gz` e `meta/<patch>/<hash>.json.gz`.
- O app abre do SQLite sem esperar a rede e baixa só quando o hash muda.
- O repo não guarda dado do jogo; o build de loja embute o último pacote publicado.

## D6. `CatalogRepo` com implementações por plataforma

- expo-sqlite no Android; memória na web e nos testes. O SQL é testado com sql.js no Jest.
- **Motivo:** expo-sqlite na web exige wasm e cabeçalhos COOP/COEP. A web existe só para screenshots e desenvolvimento.

## D7. MMKV só através de `src/lib/storage.ts`

- Um único ponto para mock e para trocar de lib. O MMKV 4 se auto-mocka no Jest e usa localStorage na web.
- Exige dev build (não roda no Expo Go), o que o spec já pede.

## D8. IA com saída estruturada (`output_config.format`) em vez de tool use forçado

- O spec aceita "tool use (ou recurso equivalente)". `tool_choice` forçado retorna 400 nos modelos atuais.
- O schema tem enums de IDs do patch; o validador compartilhado roda sempre, e nada aparece na tela sem passar por ele.

## D9. Uma Edge Function `ai` com rotas `/ai/draft`, `/ai/build-review`, `/ai/meta-tips`

- Um isolate aquecido com um catálogo em cache em vez de três funções frias. Uma função `admin` separada.

## D10. Identidade anônima via login anônimo do Supabase

- O app faz login anônimo só no primeiro uso da IA (a abertura nunca espera a rede). A cota diária usa o `sub` do JWT. Sem dado pessoal.

## D11. Tags e perfil de dano derivados, nunca inventados

- Regras de palavra-chave versionadas sobre o texto oficial das habilidades. Cada tag guarda a habilidade e o trecho que a gerou.
- A UI marca como "estimado". Override do admin tem prioridade.

## D12. Regras do jogo são dados (`bundle.rules`)

- Slots, botas, limites, grupos únicos, página de runas, Golpear e crescimento por nível vêm no pacote.
- `pipeline/data/confirmed_rules.yaml` registra o que um humano confirmou; divergência bloqueia a publicação.

## D13. Ícones baixados uma vez por patch, convertidos para WebP 128 px e hospedados por hash

- Cache imutável de 1 ano. O app nunca faz hotlink.

## D14. Política de fixtures

- Fixtures são sintéticas (`fx_*`) ou capturas reais recortadas com metadados `FIXTURE_ONLY`.
- O app recusa pacote `fixture: true` fora de dev e mostra "DADOS DE TESTE". O pipeline nunca publica fixture. O CI barra fixture dentro de `apps/mobile/assets`.

## D15. `collected_at` = primeira coleta do conteúdo atual

- Conteúdo inalterado mantém o `collected_at`, então o hash do pacote não muda em execuções diárias e o app não baixa de novo à toa. `verified_at` fica só no manifest.

## D16. Executores de teste

- Jest + RNTL no app (exigido pelo spec). Vitest no shared e nas evals (ESM e `.ts` nativos). `deno test` nas funções. pytest no pipeline.

## D17. ESLint 9 (não 10)

- O `eslint-plugin-react` usado pelo `eslint-config-expo` 58 ainda chama `context.getFilename`, removido no ESLint 10. Fica no 9.39.5 até o Expo atualizar.

## D18. NativeWind 4.2.7 + Tailwind 3

- NativeWind 5 ainda é RC. Testado no SDK 58 (RN 0.88): renderiza no Jest e no export web.
- Duas classes de cor de texto no mesmo elemento se resolvem pela ordem do CSS, não pela ordem das classes; o `AppText` descarta a cor padrão da variante quando recebe outra.

## D19. Fontes de dados efetivas no patch 7.3b

- **Wiki fora do ar** (HTTP 502 "Server maintenance" no robots.txt): pela RFC 9309, nada foi coletado dela. Itens, runas e feitiços vêm do Rift Patch Notes, que é focado em Wild Rift (a seção `/lol`, de PC, é bloqueada pela guarda do pipeline). Quando a wiki voltar, ela pode virar fonte cruzada.
- **Campeões:** site oficial (nomes en/pt-BR, classes, dificuldade, habilidades e ícones) + Rift Patch Notes (atributos base, texto detalhado das habilidades, rotas).
- O patch atual vem do sitemap oficial (notas de patch) e é comparado com o patch que o Rift Patch Notes informa; divergência vira aviso.

## D20. Teclas das habilidades

- O site oficial numera as habilidades como PASSIVE/1/2/3/ULTIMATE. O app guarda `P/Q/W/E/R` (convenção usada pela comunidade e no próprio spec: "o W da Mel") e mostra os dois na interface.

## D21. Itens transformados e consumíveis

- Itens alcançados por transformação ou missão ("Transforms into Seraph's Embrace", "upgrade to Black Mist Scythe") não têm custo na fonte: ficam com `purchasable: false` e `transforms_from`. A checagem de custo vale só para itens compráveis.
- Itens sem custo, sem atributos e com ativo (ex.: Sentinela de Controle) são consumíveis e ficam fora das builds, com aviso no relatório.

## D22. Regras de CC derivadas do texto

- Frases de condição sobre o próprio campeão ("se ela estiver imobilizada durante a conjuração", "não pode avançar enquanto estiver no chão") não contam como controle aplicado. Os casos reais que motivaram cada regra estão em `pipeline/tests/test_text_rules.py`.

## D23. Catálogo guardado como pacote inteiro no SQLite

- O app guarda a release (catálogo + meta + manifest) como um único registro JSON no SQLite e monta os índices em memória ao abrir. O catálogo do 7.3b tem 1,2 MB (311 KB comprimido); carregar e indexar é rápido o bastante e evita mapear dezenas de tabelas.
- Troca de release = uma linha substituída numa transação (nunca meia release). Dados do usuário (builds, drafts, registro de derrotas) ficam em tabelas próprias que a sincronização não toca.
- O SQL é o mesmo no Android (expo-sqlite) e nos testes (sql.js, build JS puro). Na web (só screenshots/dev) o armazenamento é em memória.
