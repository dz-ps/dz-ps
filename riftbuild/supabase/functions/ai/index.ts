// Supabase Edge Function "ai": /ai/draft (SSE), /ai/build-review, /ai/meta-tips[/generate] (DECISIONS.md D8/D9).
import { resolveSubject } from '../_shared/auth.ts';
import { loadCatalog } from '../_shared/catalog.ts';
import { ConfigError, manifestUrl, readEnv } from '../_shared/env.ts';
import { createHandler } from '../_shared/handler.ts';
import { CORS, errorBody, json, sameSecret } from '../_shared/http.ts';
import { anthropicClient } from '../_shared/llm/anthropic.ts';
import { supabaseStores } from '../_shared/stores.ts';

let handler: ((req: Request) => Promise<Response>) | null = null;

function build() {
  const env = readEnv((k) => Deno.env.get(k));
  return createHandler({
    env,
    catalog: () => loadCatalog(manifestUrl(env)),
    stores: supabaseStores(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    auth: (req) =>
      resolveSubject(req, {
        supabaseUrl: env.SUPABASE_URL,
        serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
        salt: env.RATE_LIMIT_SALT,
        allowDeviceFallback: env.ALLOW_DEVICE_FALLBACK,
      }),
    isAdminTask: (req) =>
      sameSecret(req.headers.get('authorization') ?? '', `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`),
    llm: (purpose) =>
      anthropicClient({
        apiKey: env.ANTHROPIC_API_KEY,
        model: { draft: env.AI_MODEL_DRAFT, review: env.AI_MODEL_REVIEW, tips: env.AI_MODEL_TIPS }[
          purpose
        ],
        maxTokens: purpose === 'draft' ? env.AI_MAX_TOKENS_DRAFT : env.AI_MAX_TOKENS_REVIEW,
        effort: purpose === 'draft' ? env.AI_EFFORT_DRAFT : env.AI_EFFORT_REVIEW,
        serverFallbacks: env.AI_SERVER_FALLBACKS,
        // Tips run in a scheduled job, so they get the long (review) timeout.
        timeoutMs: purpose === 'draft' ? env.AI_TIMEOUT_MS_DRAFT : env.AI_TIMEOUT_MS_REVIEW,
      }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    handler ??= build();
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : 'Configuração inválida.';
    return json(errorBody('config', message), 500);
  }
  return handler(req);
});
