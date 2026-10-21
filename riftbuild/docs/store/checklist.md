# Checklist de publicação (Google Play)

Legenda: ✅ feito no repositório · 👤 depende de você (conta, credencial ou decisão) · ⏳ fazer no aparelho

## Legal e política da Riot

- ✅ Aviso "Legal Jibber Jabber" exato na tela Sobre (`apps/mobile/src/i18n/pt-BR.ts`, teste em
  `about.test.tsx` e no smoke web) e na descrição da loja (`docs/store/listing.pt-BR.md`)
- ✅ Texto "não oficial, não endossado pela Riot" no app, na descrição e no card de compartilhamento
- ✅ Gratuito: sem paywall, sem compras no app, sem anúncios
- ✅ Ícone original provisório, sem logos nem arte da Riot (`apps/mobile/scripts/make-placeholder-icons.py`)
- ✅ Nome sem "Wild Rift", "League of Legends" ou "Riot"
- ✅ Atribuição de cada fonte (`ATTRIBUTION.md`, tela Sobre, fonte e data em cada número)
- 👤 Arte final do ícone (o atual é provisório)
- 👤 Registrar o produto no Riot Developer Portal (recomendado pela política)
- 👤 Opcional: pedir permissão ao dono do riftpatchnotes.com para usar as estatísticas

## Privacidade (LGPD e Play)

- ✅ Política de privacidade escrita (`docs/privacy.md`)
- 👤 Publicar a política numa URL pública e colocar no Play Console
- ✅ Respostas do formulário "Segurança dos dados" (`docs/store/data-safety.md`)
- ✅ "Apagar meus dados" no app (local + RPC `delete_my_data`), com confirmação; teste em `profile.test.tsx`
- ✅ Retenção: logs de IA 90 dias, cache expirado e contadores apagados diariamente (`purge_ai_logs`)
- ✅ Nenhuma chave secreta no app (só `EXPO_PUBLIC_SUPABASE_URL` e a anon key; chave da Anthropic só no servidor)
- 👤 E-mail de contato na política e na ficha

## Ficha da loja

- ✅ Nome, descrição curta e completa em pt-BR (`docs/store/listing.pt-BR.md`)
- ✅ Screenshots provisórias das 7 telas (`docs/screenshots/`, web 412×915)
- ⏳ Screenshots finais tiradas num aparelho Android
- 👤 Gráfico de destaque 1024×500 (arte própria, sem logos da Riot)
- 👤 Questionário de classificação indicativa (IARC)
- 👤 Categoria e público-alvo

## Build de release

- ✅ `apps/mobile/eas.json` com perfis development (APK com dev client), preview (APK interno) e
  production (AAB, versionCode automático remoto)
- ✅ Seed do catálogo embutido no build (`eas-build-pre-install` → `scripts/eas-seed.mjs`; obrigatório em
  preview e production)
- ✅ Pacote Android provisório: `io.github.dzps.riftbuild` (`app.json`)
- 👤 Confirmar o nome do pacote (não dá para trocar depois da primeira publicação)
- 👤 Conta Expo, `eas init` (gera o `projectId`) e `EXPO_TOKEN` no GitHub
- 👤 Variáveis de ambiente do EAS (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) nos
  ambientes preview e production
- 👤 Conta no Play Console e chave de upload (o EAS pode gerenciar)
- ⏳ Teste num aparelho: dev build, abertura a frio < 2 s, modo avião (catálogo e builds), compartilhar
  imagem no WhatsApp/Discord, deep link `riftbuild://b/<código>`

## Backend

- 👤 Projeto Supabase: aplicar `supabase/migrations`, ativar login anônimo, deploy da função `ai`
- 👤 Secrets da função: `ANTHROPIC_API_KEY`, `AI_MODEL_DRAFT`, `AI_MODEL_REVIEW`, `AI_MODEL_TIPS`
  (conferir os nomes atuais em https://docs.claude.com), `RATE_LIMIT_SALT`
- 👤 Secrets do GitHub para o pipeline diário: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- ⏳ Rodar `pnpm evals --mode=remote` com a função no ar: meta ≥ 90% e p50 < 6 s
