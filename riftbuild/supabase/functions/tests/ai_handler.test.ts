import { assert, assertEquals, assertExists } from '@std/assert';
import { catalogFromBundles } from '../_shared/catalog.ts';
import { createHandler, type HandlerDeps } from '../_shared/handler.ts';
import { replayClient } from '../_shared/llm/replay.ts';
import { memoryStores } from '../_shared/stores.ts';
import { SseParser } from '../_shared/riftbuild-shared/sse.ts';

const fixtures = new URL('../../../contracts/fixtures/valid/', import.meta.url);
const catalog = catalogFromBundles(
  JSON.parse(await Deno.readTextFile(new URL('catalog.fixture.json', fixtures))),
  JSON.parse(await Deno.readTextFile(new URL('meta.fixture.json', fixtures))),
);

const good = {
  patch: '9.9z',
  comp_read: {
    damage: { physical: 0.5, magic: 0.5, true: 0 },
    hard_cc_count: 1,
    healing: 'baixa',
    threats: ['fx_marksman'],
  },
  build: {
    items: [{ id: 'fx_anti_heal_ap', reason: 'anti-cura contra o Fx Healer' }],
    boots: { id: 'fx_boots_b', reason: 'tenacidade e RM' },
    runes: {
      keystone: 'fx_keystone_a',
      primary_path: 'domination',
      primary: ['fx_domination_1_a', 'fx_domination_2_a', 'fx_domination_3_a'],
      secondary: 'fx_resolve_1_a',
    },
    spells: ['smite', 'flash'],
    skill_order: 'Q > E > W',
  },
  counter_picks: [],
  bans: [],
  game_plan: ['Foco no Fx Marksman.'],
  confidence: 'media',
  missing_data: [],
};
const bad = structuredClone(good);
bad.build.items.push({ id: 'infinity_edge', reason: 'item do PC' });

const env: HandlerDeps['env'] = {
  AI_MODEL_DRAFT: 'test-draft-model',
  AI_MODEL_REVIEW: 'test-review-model',
  AI_SCHEMA_ENUMS: true,
  AI_DAILY_LIMIT_DRAFT: 5,
  AI_DAILY_LIMIT_REVIEW: 5,
  AI_GLOBAL_DAILY_LIMIT: 100,
  AI_TIMEOUT_MS_DRAFT: 2000,
  AI_TIMEOUT_MS_REVIEW: 2000,
  AI_CACHE_TTL_HOURS: 1,
};

function setup(responses: unknown[], overrides: Partial<HandlerDeps['env']> = {}, authed = true) {
  const stores = memoryStores();
  const llm = replayClient(responses);
  const handle = createHandler({
    env: { ...env, ...overrides },
    catalog: async () => catalog,
    stores,
    llm: () => llm,
    auth: async () => (authed ? { id: 'u:test', hash: 'h' } : null),
    isAdminTask: (req) => req.headers.get('authorization') === 'Bearer service',
  });
  return { handle, stores, llm };
}

const draftBody = {
  patch: '9.9z',
  enemies: ['fx_healer', 'fx_tank', 'fx_marksman'],
  my_role: 'jungle',
  style: ['AP'],
};
const post = (path: string, body: unknown, accept = 'text/event-stream') =>
  new Request(`http://localhost/functions/v1/ai${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept },
    body: JSON.stringify(body),
  });

async function events(res: Response) {
  const parser = new SseParser();
  return parser.push(await res.text());
}

Deno.test(
  'draft streams validated sections, then done; second identical call is served from cache',
  async () => {
    const { handle, stores, llm } = setup([good]);
    const res = await handle(post('/draft', draftBody));
    assertEquals(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const evs = await events(res);
    assertEquals(evs[0]!.event, 'meta');
    assertEquals(
      evs.filter((e) => e.event === 'section').map((e) => (e.data as { name: string }).name),
      ['comp_read', 'build', 'counter_picks', 'bans', 'game_plan'],
    );
    const done = evs.at(-1)!;
    assertEquals(done.event, 'done');
    assertEquals((done.data as { incomplete: boolean }).incomplete, false);
    assertEquals(stores.calls[0]!.status, 'ok');

    const again = await events(await handle(post('/draft', draftBody)));
    assertEquals((again[0]!.data as { cached: boolean }).cached, true);
    assertEquals(llm.requests.length, 1);
    assertEquals(stores.calls[1]!.cache_hit, true);
  },
);

Deno.test('model numbers are replaced by the deterministic comp read', async () => {
  const { handle } = setup([good]);
  const evs = await events(await handle(post('/draft', draftBody)));
  const comp = evs.find((e) => (e.data as { name?: string }).name === 'comp_read')!.data as {
    data: { hard_cc_count: number };
  };
  assertEquals(comp.data.hard_cc_count, 3);
});

Deno.test(
  'invalid ids retry once with the errors, and the fixed section replaces the old one',
  async () => {
    const { handle, llm } = setup([bad, good]);
    const evs = await events(await handle(post('/draft', draftBody)));
    assertEquals(llm.requests.length, 2);
    assert(llm.requests[1]!.messages.at(-1)!.content.includes('infinity_edge'));
    const build = evs.filter((e) => (e.data as { name?: string }).name === 'build');
    assertEquals((build.at(-1)!.data as { replaces?: boolean }).replaces, true);
    assertEquals((evs.at(-1)!.data as { incomplete: boolean }).incomplete, false);
  },
);

Deno.test(
  'still invalid after the retry: the entry is removed and the response marked incomplete',
  async () => {
    const { handle, stores } = setup([bad, bad]);
    const evs = await events(await handle(post('/draft', draftBody)));
    const done = evs.at(-1)!.data as {
      incomplete: boolean;
      response: { build: { items: { id: string }[] } };
    };
    assertEquals(done.incomplete, true);
    assert(!done.response.build.items.some((i) => i.id === 'infinity_edge'));
    assertEquals(stores.calls[0]!.status, 'incomplete');
    assertEquals(stores.cache.size, 0, 'incomplete answers are not cached');
  },
);

Deno.test('a refusal is reported and not retried', async () => {
  const { handle, llm } = setup([{ stopReason: 'refusal' }]);
  const evs = await events(await handle(post('/draft', draftBody)));
  assertEquals(llm.requests.length, 1);
  assertExists(
    evs.find((e) => e.event === 'error' && (e.data as { code: string }).code === 'ai_refused'),
  );
});

Deno.test('rejects unknown and duplicate champions, and unauthenticated calls', async () => {
  const { handle } = setup([good]);
  assertEquals((await handle(post('/draft', { ...draftBody, enemies: ['yasuo_pc'] }))).status, 400);
  assertEquals(
    (await handle(post('/draft', { ...draftBody, enemies: ['fx_tank', 'fx_tank'] }))).status,
    400,
  );
  const anon = setup([good], {}, false);
  assertEquals((await anon.handle(post('/draft', draftBody))).status, 401);
});

Deno.test('daily quota per user', async () => {
  const { handle } = setup([good], { AI_DAILY_LIMIT_DRAFT: 1 });
  assertEquals((await handle(post('/draft', draftBody))).status, 200);
  const res = await handle(post('/draft', { ...draftBody, enemies: ['fx_tank'] }));
  assertEquals(res.status, 429);
  assertEquals(((await res.json()) as { error: { code: string } }).error.code, 'rate_limited');
});

Deno.test('JSON mode returns the final validated payload', async () => {
  const { handle } = setup([good]);
  const res = await handle(post('/draft', draftBody, 'application/json'));
  const body = (await res.json()) as { response: { build: { boots: { id: string } } } };
  assertEquals(body.response.build.boots.id, 'fx_boots_b');
});

Deno.test('timeout aborts the stream and reports it', async () => {
  const stores = memoryStores();
  const slow = {
    async streamJson(req: { signal?: AbortSignal }) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 1000);
        req.signal?.addEventListener(
          'abort',
          () => (clearTimeout(t), reject(new DOMException('aborted', 'AbortError'))),
        );
      });
      return { text: '{}', stopReason: 'end_turn', usage: {}, model: 'slow' };
    },
  };
  const handle = createHandler({
    env: { ...env, AI_TIMEOUT_MS_DRAFT: 20 },
    catalog: async () => catalog,
    stores,
    llm: () => slow,
    auth: async () => ({ id: 'u:t', hash: 'h' }),
    isAdminTask: () => false,
  });
  const evs = await events(await handle(post('/draft', draftBody)));
  assertExists(
    evs.find((e) => e.event === 'error' && (e.data as { code: string }).code === 'timeout'),
  );
  assertEquals(stores.calls[0]!.status, 'timeout');
});

Deno.test('build review keeps only swaps that pass the build rules', async () => {
  const review = {
    patch: '9.9z',
    strengths: ['Boa resistência mágica.'],
    weaknesses: ['Pouco dano.'],
    swaps: [
      { remove: 'fx_mr_item', add: 'fx_anti_heal_ap', reason: 'anti-cura' },
      { remove: 'fx_mr_item', add: 'infinity_edge', reason: 'PC' },
      { remove: 'fx_mr_item', add: 'fx_boots_a', reason: 'segunda bota' },
    ],
    confidence: 'media',
    missing_data: [],
  };
  const { handle } = setup([review]);
  const res = await handle(
    post(
      '/build-review',
      {
        patch: '9.9z',
        champion_id: 'fx_tank',
        role: 'jungle',
        items: ['fx_boots_b', 'fx_mr_item'],
      },
      'application/json',
    ),
  );
  const body = (await res.json()) as { review: { swaps: { add: string }[] } };
  assertEquals(
    body.review.swaps.map((s) => s.add),
    ['fx_anti_heal_ap'],
  );
});

Deno.test(
  'meta tips: generated once per patch by the scheduled job, validated, then served',
  async () => {
    const tips = {
      patch: '9.9z',
      role: 'jungle',
      tips: [
        {
          champion_id: 'fx_tank',
          power_spikes: ['Nível 5.'],
          combos: ['E > Q'],
          common_mistakes: [],
        },
        {
          champion_id: 'garen',
          power_spikes: ['fora do catálogo'],
          combos: [],
          common_mistakes: [],
        },
      ],
      missing_data: [],
    };
    const { handle, stores, llm } = setup([tips]);
    const generate = (auth: string) =>
      new Request('http://localhost/functions/v1/ai/meta-tips/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth },
        body: JSON.stringify({ roles: ['jungle', 'mid'] }),
      });
    assertEquals((await handle(generate('Bearer user-token'))).status, 403);

    const first = (await (await handle(generate('Bearer service'))).json()) as {
      results: Record<string, string>;
    };
    assertEquals(first.results, { jungle: 'ok', mid: 'no_meta' });
    assertEquals(stores.calls.at(-1)!.kind, 'meta_tips');

    const second = (await (await handle(generate('Bearer service'))).json()) as {
      results: Record<string, string>;
    };
    assertEquals(second.results.jungle, 'cached');
    assertEquals(llm.requests.length, 1);

    const served = (await (
      await handle(new Request('http://localhost/functions/v1/ai/meta-tips?role=jungle'))
    ).json()) as { available: boolean; tips: { tips: { champion_id: string }[] } };
    assert(served.available);
    assertEquals(
      served.tips.tips.map((t) => t.champion_id),
      ['fx_tank'],
    );
    const none = await handle(new Request('http://localhost/functions/v1/ai/meta-tips?role=mid'));
    assertEquals(((await none.json()) as { available: boolean }).available, false);
    assertEquals(
      (await handle(new Request('http://localhost/functions/v1/ai/meta-tips?role=lol'))).status,
      400,
    );
  },
);
