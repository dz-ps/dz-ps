import { draftCacheMaterial, sha256Hex } from './riftbuild-shared/ai/cacheKey.ts';
import { runDraft, type LlmClient } from './riftbuild-shared/ai/orchestrator.ts';
import {
  buildDraftUserMessage,
  buildSystemPrompt,
  PROMPT_VERSION,
} from './riftbuild-shared/ai/prompt.ts';
import { draftOutputSchema } from './riftbuild-shared/ai/structuredSchema.ts';
import {
  buildTipsSystemPrompt,
  buildTipsUserMessage,
  tipChampions,
  tipsCacheKey,
  tipsOutputSchema,
  TIPS_PROMPT_VERSION,
  validateTips,
} from './riftbuild-shared/ai/tips.ts';
import { validateAiDraft, type DraftContext } from './riftbuild-shared/ai/validateAi.ts';
import { selectCandidates } from './riftbuild-shared/comp/candidates.ts';
import { analyzeComp } from './riftbuild-shared/comp/compAnalyzer.ts';
import { AiBuildReview, DraftInput, type AiDraftResponse } from './riftbuild-shared/schemas/ai.ts';
import { ROLES, Role } from './riftbuild-shared/schemas/common.ts';
import { canAddItem, itemIssues } from './riftbuild-shared/rules/buildValidator.ts';
import { emptyBuild } from './riftbuild-shared/rules/types.ts';
import { z } from 'zod';
import type { AiEnv } from './env.ts';
import type { LoadedCatalog } from './catalog.ts';
import type { Subject } from './auth.ts';
import { CORS, errorBody, json, sse } from './http.ts';
import type { Stores } from './stores.ts';

export type HandlerDeps = {
  env: Pick<
    AiEnv,
    | 'AI_MODEL_DRAFT'
    | 'AI_MODEL_REVIEW'
    | 'AI_SCHEMA_ENUMS'
    | 'AI_DAILY_LIMIT_DRAFT'
    | 'AI_DAILY_LIMIT_REVIEW'
    | 'AI_GLOBAL_DAILY_LIMIT'
    | 'AI_TIMEOUT_MS_DRAFT'
    | 'AI_TIMEOUT_MS_REVIEW'
    | 'AI_CACHE_TTL_HOURS'
  >;
  catalog: () => Promise<LoadedCatalog>;
  stores: Stores;
  llm: (purpose: 'draft' | 'review' | 'tips') => LlmClient;
  auth: (req: Request) => Promise<Subject | null>;
  /** Scheduled jobs only (pipeline workflow): true when the request carries the service-role key. */
  isAdminTask: (req: Request) => boolean;
  now?: () => number;
};

const digest = (data: Uint8Array) =>
  crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
const systemPromptCache = new Map<string, string>();
const schemaCache = new Map<string, Record<string, unknown>>();

export function createHandler(deps: HandlerDeps) {
  const now = deps.now ?? (() => Date.now());
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const path = new URL(req.url).pathname;
    try {
      if (path.endsWith('/draft') && req.method === 'POST') return await draft(req);
      if (path.endsWith('/build-review') && req.method === 'POST') return await buildReview(req);
      if (path.endsWith('/meta-tips') && req.method === 'GET') return await metaTips(req);
      if (path.endsWith('/meta-tips/generate') && req.method === 'POST')
        return await generateTips(req);
      return json(errorBody('not_found', 'Rota não encontrada.'), 404);
    } catch (err) {
      console.error('ai handler error', err);
      return json(
        errorBody(
          'ai_unavailable',
          'A análise com IA está indisponível agora. Tente de novo em instantes.',
        ),
        503,
      );
    }
  };

  async function guard(req: Request, kind: 'draft' | 'build_review', limit: number) {
    const subject = await deps.auth(req);
    if (!subject)
      return {
        error: json(errorBody('unauthorized', 'Faça login (anônimo) para usar a IA.'), 401),
      };
    const global = await deps.stores.consumeQuota('global', kind, deps.env.AI_GLOBAL_DAILY_LIMIT);
    const mine = global.allowed ? await deps.stores.consumeQuota(subject.id, kind, limit) : global;
    if (!global.allowed || !mine.allowed) {
      await deps.stores.logCall({
        kind,
        subject_hash: subject.hash,
        model: null,
        patch: null,
        cache_hit: false,
        attempts: 0,
        latency_ms: 0,
        status: 'rate_limited',
      });
      return {
        error: json(
          errorBody(
            'rate_limited',
            `Limite diário de análises atingido (${limit} por dia). Volte amanhã.`,
          ),
          429,
        ),
        subject,
      };
    }
    return { subject };
  }

  async function draft(req: Request): Promise<Response> {
    const started = now();
    const parsed = DraftInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json(errorBody('invalid_input', 'Pedido inválido.'), 400);
    const input = parsed.data;
    const loaded = await deps.catalog();
    const { index, meta } = loaded;

    const all = [
      ...input.enemies,
      ...input.allies,
      ...(input.my_champion ? [input.my_champion] : []),
    ];
    const unknown = all.filter((id) => !index.champions.has(id));
    if (unknown.length)
      return json(
        errorBody(
          'invalid_input',
          `Campeões fora do catálogo do patch ${index.patch}: ${unknown.join(', ')}`,
        ),
        400,
      );
    if (new Set(all).size !== all.length)
      return json(
        errorBody('invalid_input', 'O mesmo campeão aparece mais de uma vez no draft.'),
        400,
      );

    const comp = analyzeComp(input.enemies, index, meta, input.elo);
    const metaBuild = input.my_champion
      ? (meta?.builds.find(
          (b) =>
            b.champion_id === input.my_champion && (!input.my_role || b.role === input.my_role),
        ) ?? null)
      : null;
    const candidates = selectCandidates({
      comp,
      myChampionId: input.my_champion,
      role: input.my_role,
      style: input.style,
      index,
      metaBuild,
    });
    const ctx: DraftContext = {
      index,
      comp,
      enemies: input.enemies,
      allies: input.allies,
      myChampionId: input.my_champion,
      role: input.my_role,
    };
    const model = deps.env.AI_MODEL_DRAFT;
    const key = await sha256Hex(
      draftCacheMaterial(input, {
        kind: 'draft',
        model,
        promptVersion: PROMPT_VERSION,
        bundleHash: loaded.bundleHash,
      }),
      digest,
    );
    const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');
    const catalogMismatch = !!input.bundle_hash && input.bundle_hash !== loaded.bundleHash;

    const cached = await deps.stores.cacheGet(key);
    if (cached) {
      const validated = validateAiDraft(cached.response, ctx);
      const subject = await deps.auth(req);
      await deps.stores.logCall({
        kind: 'draft',
        subject_hash: subject?.hash ?? 'anon',
        model: cached.model,
        patch: index.patch,
        cache_hit: true,
        attempts: 0,
        latency_ms: now() - started,
        status: 'ok',
        prompt_version: PROMPT_VERSION,
      });
      const done = {
        response: validated.response,
        incomplete: validated.incomplete,
        removed: validated.removed,
        missing_data: validated.response.missing_data,
      };
      if (wantsJson)
        return json({ meta: { cached: true, patch: index.patch, model: cached.model }, ...done });
      return sse(async (send) => {
        send('meta', {
          cached: true,
          patch: index.patch,
          model: cached.model,
          prompt_version: PROMPT_VERSION,
          catalog_mismatch: catalogMismatch,
        });
        for (const name of ['comp_read', 'build', 'counter_picks', 'bans', 'game_plan'] as const) {
          send('section', { name, data: validated.response[name], attempt: 0 });
        }
        send('done', done);
      });
    }

    const gate = await guard(req, 'draft', deps.env.AI_DAILY_LIMIT_DRAFT);
    if (gate.error) return gate.error;
    const subject = gate.subject!;

    const systemKey = `${loaded.bundleHash}|${PROMPT_VERSION}`;
    const system = systemPromptCache.get(systemKey) ?? buildSystemPrompt(index);
    systemPromptCache.set(systemKey, system);
    const schemaKey = `${loaded.bundleHash}|${deps.env.AI_SCHEMA_ENUMS}`;
    const schema =
      schemaCache.get(schemaKey) ?? draftOutputSchema(index, { enums: deps.env.AI_SCHEMA_ENUMS });
    schemaCache.set(schemaKey, schema);
    const userMessage = buildDraftUserMessage(input, index, comp, candidates);

    const execute = async (send: (event: string, data: unknown) => void) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.env.AI_TIMEOUT_MS_DRAFT);
      send('meta', {
        cached: false,
        patch: index.patch,
        model,
        prompt_version: PROMPT_VERSION,
        catalog_mismatch: catalogMismatch,
      });
      let status: 'ok' | 'incomplete' | 'error' | 'refused' | 'timeout' = 'ok';
      let result: Awaited<ReturnType<typeof runDraft>> | null = null;
      try {
        result = await runDraft({
          llm: deps.llm('draft'),
          ctx,
          system,
          userMessage,
          schema,
          signal: controller.signal,
          now,
          onSection: (e) => send('section', e),
        });
        status = result.refused ? 'refused' : result.incomplete ? 'incomplete' : 'ok';
        if (result.refused)
          send(
            'error',
            errorBody(
              'ai_refused',
              'A IA recusou este pedido. A leitura instantânea continua válida.',
            ).error,
          );
        send('done', {
          response: result.response,
          incomplete: result.incomplete,
          removed: result.removed,
          missing_data: result.response.missing_data,
        });
        if (status === 'ok') {
          await deps.stores.cachePut(key, {
            kind: 'draft',
            patch: index.patch,
            bundle_hash: loaded.bundleHash,
            model: result.model ?? model,
            prompt_version: PROMPT_VERSION,
            response: result.response,
            ttlHours: deps.env.AI_CACHE_TTL_HOURS,
          });
        }
      } catch (err) {
        status = controller.signal.aborted ? 'timeout' : 'error';
        send(
          'error',
          errorBody(
            status === 'timeout' ? 'timeout' : 'ai_unavailable',
            status === 'timeout'
              ? 'A IA demorou demais. Tente de novo.'
              : 'A análise com IA falhou. Tente de novo.',
          ).error,
        );
        console.error('draft failed', err);
      } finally {
        clearTimeout(timer);
        const usage = result?.usage ?? [];
        const sum = (
          k:
            | 'input_tokens'
            | 'output_tokens'
            | 'cache_read_input_tokens'
            | 'cache_creation_input_tokens',
        ) => usage.reduce((acc, u) => acc + (u[k] ?? 0), 0);
        await deps.stores.logCall({
          kind: 'draft',
          subject_hash: subject.hash,
          model: result?.model ?? model,
          patch: index.patch,
          cache_hit: false,
          attempts: result?.attempts ?? 0,
          input_tokens: sum('input_tokens'),
          output_tokens: sum('output_tokens'),
          cache_read_tokens: sum('cache_read_input_tokens'),
          cache_creation_tokens: sum('cache_creation_input_tokens'),
          ttft_ms: result?.firstSectionMs ?? null,
          latency_ms: now() - started,
          status,
          removed_ids: (result?.removed ?? []).map((p) => p.id).filter((x): x is string => !!x),
          prompt_version: PROMPT_VERSION,
        });
      }
    };

    if (wantsJson) {
      const events: { event: string; data: unknown }[] = [];
      await execute((event, data) => events.push({ event, data }));
      const done = events.find((e) => e.event === 'done')?.data as
        Record<string, unknown> | undefined;
      const error = events.find((e) => e.event === 'error')?.data;
      return json(
        { meta: events[0]?.data, ...(done ?? {}), ...(error ? { error } : {}) },
        done ? 200 : 503,
      );
    }
    return sse(execute);
  }

  async function buildReview(req: Request): Promise<Response> {
    const started = now();
    const Body = z.object({
      patch: z.string(),
      champion_id: z.string(),
      role: z.enum(['baron', 'jungle', 'mid', 'dragon', 'support']).nullable().default(null),
      items: z.array(z.string()).max(8),
      style: z.array(z.string().max(40)).max(5).default([]),
    });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json(errorBody('invalid_input', 'Pedido inválido.'), 400);
    const body = parsed.data;
    const loaded = await deps.catalog();
    const { index } = loaded;
    const champ = index.champions.get(body.champion_id);
    if (!champ || body.items.some((i) => !index.items.has(i)))
      return json(errorBody('invalid_input', 'Build com IDs fora do catálogo.'), 400);

    const model = deps.env.AI_MODEL_REVIEW;
    const key = await sha256Hex(
      JSON.stringify({
        v: PROMPT_VERSION,
        k: 'review',
        model,
        h: loaded.bundleHash,
        ...body,
        items: body.items,
      }),
      digest,
    );
    const cached = await deps.stores.cacheGet(key);
    if (cached) return json({ cached: true, review: cached.response });

    const gate = await guard(req, 'build_review', deps.env.AI_DAILY_LIMIT_REVIEW);
    if (gate.error) return gate.error;

    const schema = reviewSchema();
    const system = `${buildSystemPrompt(index)}\n\nTarefa: revisar uma build. Liste pontos fortes, pontos fracos e trocas (remove = item da build, add = item do catálogo), cada uma com motivo curto em pt-BR.`;
    const message = JSON.stringify({
      campeao: {
        id: champ.id,
        classes: champ.classes,
        tags: champ.tags.map((t) => t.tag),
        dano: champ.damage_profile,
      },
      rota: body.role,
      estilo: body.style,
      itens: body.items.map((id) => ({
        id,
        categoria: index.items.get(id)!.category,
        tags: index.items.get(id)!.tags,
      })),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.env.AI_TIMEOUT_MS_REVIEW);
    try {
      const result = await deps.llm('review').streamJson(
        {
          system,
          messages: [{ role: 'user', content: message }],
          schema,
          signal: controller.signal,
        },
        () => {},
      );
      if (result.stopReason === 'refusal')
        return json(errorBody('ai_refused', 'A IA recusou este pedido.'), 200);
      const review = AiBuildReview.safeParse(JSON.parse(result.text || '{}'));
      if (!review.success)
        return json(errorBody('ai_unavailable', 'Resposta da IA inválida.'), 502);
      // Swaps go through the same item rules as the build creator.
      const swaps = review.data.swaps.filter((s) => {
        if (!body.items.includes(s.remove) || !index.items.has(s.add)) return false;
        const without = emptyBuild(index.rules.item_slots);
        body.items.filter((i) => i !== s.remove).forEach((id, n) => (without.items[n] = id));
        return canAddItem(without, s.add, index).ok;
      });
      const clean = { ...review.data, patch: index.patch, swaps };
      await deps.stores.cachePut(key, {
        kind: 'build_review',
        patch: index.patch,
        bundle_hash: loaded.bundleHash,
        model,
        prompt_version: PROMPT_VERSION,
        response: clean,
        ttlHours: deps.env.AI_CACHE_TTL_HOURS,
      });
      await deps.stores.logCall({
        kind: 'build_review',
        subject_hash: gate.subject!.hash,
        model: result.model,
        patch: index.patch,
        cache_hit: false,
        attempts: 1,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        latency_ms: now() - started,
        status: swaps.length === review.data.swaps.length ? 'ok' : 'incomplete',
        prompt_version: PROMPT_VERSION,
      });
      return json({
        cached: false,
        review: clean,
        warnings: itemIssues(body.items, index).map((i) => i.message_pt),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function metaTips(req: Request): Promise<Response> {
    const role = Role.safeParse(new URL(req.url).searchParams.get('role'));
    if (!role.success) return json(errorBody('invalid_input', 'Rota inválida.'), 400);
    const loaded = await deps.catalog();
    const hit = await deps.stores.cacheGet(tipsCacheKey(loaded.index.patch, role.data));
    return hit ? json({ available: true, tips: hit.response }) : json({ available: false });
  }

  /**
   * Generates "campeões em alta" tips once per patch and role (spec §5.3). Called by the pipeline workflow
   * after a publish; never by the app. Roles that already have tips for this patch are skipped.
   */
  async function generateTips(req: Request): Promise<Response> {
    if (!deps.isAdminTask(req))
      return json(errorBody('forbidden', 'Rota reservada para tarefas agendadas.'), 403);
    const body = z
      .object({ roles: z.array(Role).optional(), force: z.boolean().default(false) })
      .safeParse(await req.json().catch(() => ({})));
    if (!body.success) return json(errorBody('invalid_input', 'Pedido inválido.'), 400);
    const loaded = await deps.catalog();
    const { index, meta } = loaded;
    const results: Record<string, string> = {};
    for (const role of body.data.roles ?? ROLES) {
      const key = tipsCacheKey(index.patch, role);
      if (!body.data.force && (await deps.stores.cacheGet(key))) {
        results[role] = 'cached';
        continue;
      }
      const ids = tipChampions(index, meta, role);
      if (!ids.length) {
        results[role] = 'no_meta';
        continue;
      }
      const started = now();
      try {
        const result = await deps.llm('tips').streamJson(
          {
            system: buildTipsSystemPrompt(index.patch),
            messages: [{ role: 'user', content: buildTipsUserMessage(index, meta, role, ids) }],
            schema: tipsOutputSchema(ids),
          },
          () => {},
        );
        const tips =
          result.stopReason === 'refusal'
            ? null
            : validateTips(JSON.parse(result.text || '{}'), { index, role, allowed: ids });
        const status = !tips ? 'error' : tips.tips.length < ids.length ? 'incomplete' : 'ok';
        if (tips?.tips.length)
          await deps.stores.cachePut(key, {
            kind: 'meta_tips',
            patch: index.patch,
            bundle_hash: loaded.bundleHash,
            model: result.model,
            prompt_version: TIPS_PROMPT_VERSION,
            response: tips,
            // One generation per patch: the key carries the patch, so a new patch starts empty.
            ttlHours: 24 * 60,
          });
        await deps.stores.logCall({
          kind: 'meta_tips',
          subject_hash: 'admin',
          model: result.model,
          patch: index.patch,
          cache_hit: false,
          attempts: 1,
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
          latency_ms: now() - started,
          status: result.stopReason === 'refusal' ? 'refused' : status,
          prompt_version: TIPS_PROMPT_VERSION,
        });
        results[role] = tips?.tips.length ? status : 'error';
      } catch (err) {
        console.error('tips generation failed', role, err);
        results[role] = 'error';
      }
    }
    return json({ patch: index.patch, results });
  }
}

function reviewSchema(): Record<string, unknown> {
  const str = { type: 'string' };
  const arr = (items: unknown) => ({ type: 'array', items });
  return {
    type: 'object',
    additionalProperties: false,
    required: ['patch', 'strengths', 'weaknesses', 'swaps', 'confidence', 'missing_data'],
    properties: {
      patch: str,
      strengths: arr(str),
      weaknesses: arr(str),
      swaps: arr({
        type: 'object',
        additionalProperties: false,
        required: ['remove', 'add', 'reason'],
        properties: { remove: str, add: str, reason: str },
      }),
      confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      missing_data: arr(str),
    },
  };
}

export type { AiDraftResponse };
