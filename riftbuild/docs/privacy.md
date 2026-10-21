# Política de privacidade do RiftBuild

Última atualização: 21/10/2026.

O RiftBuild é um app de fã, gratuito e não oficial, para League of Legends: Wild Rift. Esta política
explica quais dados o app trata, para quê e como apagar, conforme a Lei Geral de Proteção de Dados
(LGPD, Lei 13.709/2018).

## Resumo

- Não pedimos nome, e-mail, telefone nem localização. Não há conta obrigatória.
- Builds, drafts, registro de derrotas, perfil e preferências ficam só no seu aparelho.
- Para a análise com IA, o servidor recebe a composição do draft e um identificador anônimo.
- Não vendemos nem compartilhamos dados para publicidade. O app não tem anúncios.
- Você apaga tudo em **Perfil → Apagar meus dados**.

## O que fica no seu aparelho

| Dado                                               | Para quê                                  |
| -------------------------------------------------- | ----------------------------------------- |
| Catálogo e meta do patch (dados do jogo)           | Funcionar offline                         |
| Builds salvas, drafts salvos, registro de derrotas | Recursos do app                           |
| Perfil (campeões principais, rota, elo, estilo)    | Personalizar bans e sugestões             |
| Sessão anônima do Supabase                         | Identificar o aparelho nas chamadas de IA |

Esses dados não saem do aparelho, exceto o descrito abaixo.

## O que vai para o servidor

Só quando você usa a análise com IA (draft ou revisão de build):

| Dado                                                                                                                           | Base legal (LGPD)                                                            | Retenção                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Identificador anônimo da sessão (gerado pelo login anônimo do Supabase; não contém dados pessoais)                             | Execução do serviço pedido e legítimo interesse (limite diário contra abuso) | Enquanto a sessão existir; contadores diários apagados após 7 dias                                              |
| Conteúdo do pedido: campeões do draft, rota, estilo e patch                                                                    | Execução do serviço pedido                                                   | Respostas guardadas em cache por até 72 horas (dicas de meta: até a troca de patch), sem identificar quem pediu |
| Registro técnico da chamada: código pseudonimizado (hash com sal) do identificador, modelo, tokens, tempo de resposta e status | Legítimo interesse (custo, desempenho e abuso)                               | 90 dias                                                                                                         |

Não guardamos endereço IP em tabelas do app. Os provedores abaixo podem registrar IPs nos próprios logs
de infraestrutura, conforme as políticas deles.

## Operadores (quem processa por nós)

| Operador   | Papel                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Supabase   | Banco de dados, armazenamento do catálogo e funções do servidor                                            |
| Anthropic  | Modelo de IA que gera a análise; recebe só o conteúdo do pedido (composição do draft), sem o identificador |
| Expo (EAS) | Compilação e distribuição do app; não recebe dados de uso do app                                           |

## Seus direitos

Você pode, a qualquer momento:

- **Apagar seus dados:** Perfil → Apagar meus dados. Isso apaga builds, drafts, derrotas, perfil e
  preferências do aparelho e, quando houver sessão, os dados do servidor ligados a ela (hoje, os
  contadores de uso; a função também cobre perfil e builds compartilhadas no servidor, que o app ainda
  não usa). O catálogo do jogo continua no aparelho.
- Pedir informações ou exercer outros direitos da LGPD pelo contato abaixo.

## Crianças

O app não é direcionado a menores de 13 anos e não coleta dados pessoais de forma consciente.

## Contato

TODO: e-mail do responsável pelo app.

## Aviso legal

RiftBuild was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games.
Riot Games does not endorse or sponsor this project.
