# Formulário "Segurança dos dados" (Google Play)

Respostas para o Play Console, baseadas no código atual (`docs/privacy.md` explica o mesmo para o usuário).

## Visão geral

| Pergunta                                                            | Resposta                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| O app coleta ou compartilha algum dos tipos de dados exigidos?      | Sim (coleta)                                                                                                             |
| Todos os dados coletados são criptografados em trânsito?            | Sim (HTTPS para Supabase e para a função de IA)                                                                          |
| Você oferece uma forma de os usuários pedirem a exclusão dos dados? | Sim: botão "Apagar meus dados" no app                                                                                    |
| Compartilha dados com terceiros?                                    | Não. Supabase e Anthropic atuam como operadores (prestadores de serviço), o que o Google não conta como compartilhamento |

## Tipos de dados coletados

| Categoria → tipo                                        | Coletado | Compartilhado | Opcional?             | Finalidade                                             | Observação                                                                                                                                      |
| ------------------------------------------------------- | -------- | ------------- | --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs do dispositivo ou outros IDs → "Outros IDs"         | Sim      | Não           | Sim (só ao usar a IA) | Funcionalidade do app; prevenção de fraude e segurança | ID da sessão anônima do Supabase, usado no limite diário                                                                                        |
| Atividade no app → "Outro conteúdo gerado pelo usuário" | Sim      | Não           | Sim (só ao usar a IA) | Funcionalidade do app                                  | Composição do draft, rota e estilo enviados para gerar a análise; processados de forma temporária (cache de até 72 h sem identificar o usuário) |
| Informações e desempenho do app → "Diagnóstico"         | Sim      | Não           | Sim (só ao usar a IA) | Análise; funcionalidade do app                         | Tempo de resposta, tokens e status de cada chamada, com ID pseudonimizado; 90 dias                                                              |

Não coletados: localização, informações pessoais (nome, e-mail, telefone), dados financeiros, saúde,
mensagens, fotos, áudio, arquivos, agenda, contatos, histórico de navegação e listas de apps.

## Itens que não precisam ser declarados

- Builds, drafts, perfil e registro de derrotas: ficam só no aparelho (dados processados localmente não
  contam como coleta).
- O catálogo do jogo baixado pelo app: é conteúdo do app, não dado do usuário.
