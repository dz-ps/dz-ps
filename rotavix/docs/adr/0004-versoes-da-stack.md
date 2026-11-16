# 0004. Versões da stack (novembro de 2026)

Data: 2026-11-16 · Status: aceito

| Peça            | Versão                                               | Observação                                                                              |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| React           | 19.3                                                 |                                                                                         |
| Vite            | 8.3 (Rolldown)                                       | `manualChunks` em objeto não existe mais; o mapa é separado por `import()`              |
| TypeScript      | **6.0**                                              | o 7.0 já saiu, mas o typescript-eslint 8 só aceita `< 6.1`. Subir quando houver suporte |
| MapLibre GL JS  | 6.18                                                 | worker em módulo separado: `setWorkerUrl` com `?worker&url` do Vite                     |
| PMTiles         | 4.5                                                  | `FileSource` lendo o arquivo do OPFS                                                    |
| Capacitor       | 8.6                                                  | compileSdk/targetSdk 36, minSdk 24                                                      |
| TanStack Router | 1.170                                                | rotas em código (sem gerador)                                                           |
| Tailwind        | 4.3                                                  | tokens via variáveis CSS geradas de `packages/ui`                                       |
| Playwright      | 1.63                                                 | igual ao navegador pré-instalado no ambiente de CI/nuvem                                |
| Python          | 3.12+ com uv (workspace com `apps/api` e `pipeline`) |                                                                                         |

Motion, Radix, TanStack Query e Dexie ficam para quando houver uso real (Fases 1 a 3). Isso ajuda a manter o shell
em ~107 KB gzip (orçamento de 170 KB).
