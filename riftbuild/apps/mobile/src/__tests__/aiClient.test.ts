import { analyzeComp, indexCatalog } from '@riftbuild/shared';
import { streamDraft } from '@/data/remote/ai';
import { testRelease } from '@/test/fixtures';

jest.mock('@/lib/env', () => ({
  env: { hasBackend: true, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' },
}));

const index = indexCatalog(testRelease().catalog);
const enemies = ['fx_healer', 'fx_tank'];
const ctx = {
  index,
  comp: analyzeComp(enemies, index),
  enemies,
  allies: [],
  myChampionId: null,
  role: 'jungle' as const,
};

function sseResponse(text: string) {
  return {
    ok: true,
    status: 200,
    body: null,
    text: async () => text,
    json: async () => ({}),
  } as unknown as Response;
}

describe('AI client: nothing unvalidated reaches the screen', () => {
  it('drops invalid ids from a (malicious or buggy) server before rendering', async () => {
    const section = (name: string, data: unknown) =>
      `event: section\ndata: ${JSON.stringify({ name, data })}\n\n`;
    const wire =
      `event: meta\ndata: {"cached":false,"model":"m"}\n\n` +
      section('build', {
        items: [
          { id: 'infinity_edge', reason: 'item de PC' },
          { id: 'fx_mr_item', reason: 'RM' },
        ],
        boots: { id: 'fx_mr_item', reason: 'não é bota' },
        runes: null,
        spells: ['flash', 'ignite'],
        skill_order: 'Q > W',
      }) +
      section('bans', [
        { champion_id: 'teemo_pc', reason: 'x' },
        { champion_id: 'fx_marksman', reason: 'forte' },
      ]);
    const rendered: Record<string, unknown> = {};
    await streamDraft(
      {
        patch: '9.9z',
        bundle_hash: null,
        enemies,
        allies: [],
        my_champion: null,
        my_role: 'jungle',
        elo: null,
        style: [],
      },
      ctx,
      { onSection: (n, d) => (rendered[n] = d), onDone: () => {}, onError: () => {} },
      undefined,
      {
        fetchFn: (async () => sseResponse(wire)) as unknown as typeof fetch,
        token: async () => 'tok',
        baseUrl: 'https://x/functions/v1',
      },
    );
    const build = rendered.build as { items: { id: string }[]; boots: unknown; spells: unknown };
    expect(build.items.map((i) => i.id)).toEqual(['fx_mr_item']);
    expect(build.boots).toBeNull();
    expect(build.spells).toBeNull(); // jungle without Smite
    expect((rendered.bans as { champion_id: string }[]).map((b) => b.champion_id)).toEqual([
      'fx_marksman',
    ]);
  });

  it('turns offline into a clear message instead of an exception', async () => {
    const onError = jest.fn();
    await streamDraft(
      {
        patch: '9.9z',
        bundle_hash: null,
        enemies,
        allies: [],
        my_champion: null,
        my_role: null,
        elo: null,
        style: [],
      },
      ctx,
      { onSection: () => {}, onDone: () => {}, onError },
      undefined,
      {
        fetchFn: (async () => {
          throw new TypeError('Network request failed');
        }) as unknown as typeof fetch,
        token: async () => 'tok',
        baseUrl: 'https://x',
      },
    );
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('precisa de internet'), 'network');
  });
});
