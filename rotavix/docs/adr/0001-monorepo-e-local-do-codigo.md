# 0001. Monorepo em `rotavix/` dentro do repositório atual

Data: 2026-11-15 · Status: provisório (aguarda resposta do dono)

## Contexto

A sessão de trabalho só tem acesso ao repositório `dz-ps/dz-ps`, que hoje é o repositório
de perfil do GitHub (README, SVGs, workflow da cobrinha). A SPEC pede a raiz `rotavix/`.

## Decisão

Todo o código fica em `rotavix/`, isolado do conteúdo do perfil, num monorepo:
pnpm workspaces para TS (`apps/app`, `packages/*`) e uv para Python (`apps/api`, `pipeline`).
Quando houver um repositório próprio, a pasta sai com histórico via
`git subtree split --prefix=rotavix -b rotavix-only`.

## Consequências

- Nenhum arquivo do perfil é tocado.
- Comandos e CI rodam com `working-directory: rotavix`.
