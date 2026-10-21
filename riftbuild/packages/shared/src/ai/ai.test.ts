import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureIndex } from '../../test/fixtures.ts';
import { selectCandidates } from '../comp/candidates.ts';
import { analyzeComp } from '../comp/compAnalyzer.ts';
import { SseParser, encodeSse } from '../sse.ts';
import { canonicalJson } from './cacheKey.ts';
import { JsonSectionStream } from './jsonSections.ts';
import { runDraft, type LlmClient, type SectionEvent } from './orchestrator.ts';
import { draftOutputSchema } from './structuredSchema.ts';
import { validateAiDraft, type DraftContext } from './validateAi.ts';

const index = fixtureIndex();
const enemies = ['fx_healer', 'fx_tank', 'fx_marksman'];
const comp = analyzeComp(enemies, index);
const ctx: DraftContext = { index, comp, enemies, allies: [], myChampionId: null, role: 'jungle' };

const goodResponse = {
  patch: '9.9z',
  comp_read: {
    damage: { physical: 0.9, magic: 0.1, true: 0 },
    hard_cc_count: 99,
    healing: 'nenhuma',
    threats: ['fx_marksman'],
  },
  build: {
    items: [
      { id: 'fx_anti_heal_ap', reason: 'anti-cura' },
      { id: 'fx_mr_item', reason: 'RM' },
    ],
    boots: { id: 'fx_boots_b', reason: 'tenacidade e RM' },
    runes: {
      keystone: 'fx_keystone_a',
      primary_path: 'domination',
      primary: ['fx_domination_1_a', 'fx_domination_2_a', 'fx_domination_3_a'],
      secondary: 'fx_resolve_1_b',
    },
    spells: ['smite', 'flash'],
    skill_order: 'Q > W > E',
  },
  counter_picks: [],
  bans: [],
  game_plan: ['Foco no Fx Marksman'],
  confidence: 'media',
  missing_data: [],
};

describe('deterministic comp read', () => {
  it('reads healing, hard CC, damage and threats from catalog tags', () => {
    expect(comp.healers).toEqual(['fx_healer']);
    expect(comp.healing).toBe('media'); // support healer weighs 2
    expect(comp.hardCcCount).toBe(3); // tank Q, tank R, marksman E
    expect(comp.damage.physical + comp.damage.magic + comp.damage.true).toBeCloseTo(1, 1);
    expect(comp.threats[0]?.championId).toBe('fx_marksman');
  });

  it('selects candidates by rule, scoped to the build damage type', () => {
    const c = selectCandidates({
      comp,
      myChampionId: 'fx_tank',
      role: 'jungle',
      style: ['AP'],
      index,
    });
    expect(c.buildDamage).toBe('magic');
    const antiHeal = c.groups.find((g) => g.ruleId === 'anti_heal');
    expect(antiHeal?.itemIds).toEqual(['fx_anti_heal_ap']);
    expect(antiHeal?.reason_pt).toContain('Fx Healer');
  });

  it('runs well under the 1 s budget', () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++)
      selectCandidates({
        comp: analyzeComp(enemies, index),
        myChampionId: 'fx_tank',
        role: 'jungle',
        style: [],
        index,
      });
    expect((performance.now() - t0) / 200).toBeLessThan(5);
  });
});

describe('AI response validation (spec §6.5)', () => {
  it('accepts a valid response and overwrites model numbers with deterministic ones', () => {
    const out = validateAiDraft(goodResponse, ctx);
    expect(out.problems).toEqual([]);
    expect(out.response.comp_read.hard_cc_count).toBe(comp.hardCcCount);
    expect(out.response.comp_read.damage).toEqual(comp.damage);
  });

  it('strips unknown ids, second boots, invalid runes and jungle spell violations', () => {
    const bad = structuredClone(goodResponse);
    bad.build.items.push(
      { id: 'infinity_edge', reason: 'PC item' },
      { id: 'fx_boots_a', reason: 'boots in items' },
    );
    bad.build.runes.secondary = 'fx_domination_1_b';
    bad.build.spells = ['flash', 'ignite'];
    const out = validateAiDraft(bad, ctx);
    const ids = out.response.build.items.map((i) => i.id);
    expect(ids).not.toContain('infinity_edge');
    expect(ids).not.toContain('fx_boots_a');
    expect(out.response.build.runes).toBeNull();
    expect(out.response.build.spells).toBeNull();
    expect(out.response.missing_data).toEqual(expect.arrayContaining(['runes', 'spells']));
    expect(out.incomplete).toBe(true);
  });

  it('property: no id outside the catalog ever survives validation', () => {
    const catalogIds = new Set([...index.items.keys()]);
    const champIds = new Set([...index.champions.keys()]);
    const anyId = fc.oneof(
      fc.constantFrom(...catalogIds, ...champIds),
      fc.stringMatching(/^[a-z]{1,8}(_[a-z]{1,6})?$/),
    );
    fc.assert(
      fc.property(
        fc.array(anyId, { maxLength: 8 }),
        fc.array(anyId, { maxLength: 4 }),
        fc.option(anyId, { nil: null }),
        (items, champs, boots) => {
          const resp = structuredClone(goodResponse) as unknown as {
            build: { items: { id: string; reason: string }[]; boots: unknown };
          };
          resp.build.items = items.map((id) => ({ id, reason: 'x' }));
          resp.build.boots = boots ? { id: boots, reason: 'x' } : null;
          (resp as unknown as { bans: unknown }).bans = champs.map((id) => ({
            champion_id: id,
            reason: 'x',
          }));
          const out = validateAiDraft(resp, ctx).response;
          for (const i of out.build.items) expect(catalogIds.has(i.id)).toBe(true);
          if (out.build.boots) expect(index.items.get(out.build.boots.id)?.category).toBe('boots');
          for (const b of out.bans) expect(champIds.has(b.champion_id)).toBe(true);
          expect(out.build.items.length + (out.build.boots ? 1 : 0)).toBeLessThanOrEqual(
            index.rules.item_slots,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('streaming helpers', () => {
  it('JsonSectionStream yields top-level sections as soon as they close, across arbitrary chunking', () => {
    const text = JSON.stringify(goodResponse);
    for (const size of [1, 3, 7, 50, text.length]) {
      const stream = new JsonSectionStream();
      const keys: string[] = [];
      for (let i = 0; i < text.length; i += size)
        stream.push(text.slice(i, i + size)).forEach(([k]) => keys.push(k));
      expect(keys).toEqual(Object.keys(goodResponse));
    }
  });

  it('handles braces and quotes inside strings', () => {
    const stream = new JsonSectionStream();
    const out = stream.push('{"game_plan":["não use o R } \\" { ainda"],"patch":"1.0"}');
    expect(out).toEqual([
      ['game_plan', ['não use o R } " { ainda']],
      ['patch', '1.0'],
    ]);
  });

  it('SSE round trip with split chunks', () => {
    const wire =
      encodeSse('section', { name: 'build', data: { a: 1 } }) + encodeSse('done', { ok: true });
    const parser = new SseParser();
    const events = [...parser.push(wire.slice(0, 10)), ...parser.push(wire.slice(10))];
    expect(events).toEqual([
      { event: 'section', data: { name: 'build', data: { a: 1 } } },
      { event: 'done', data: { ok: true } },
    ]);
  });

  it('canonical JSON is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(
      canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }),
    );
  });
});

function fakeLlm(responses: unknown[]): LlmClient & { calls: number } {
  return {
    calls: 0,
    async streamJson(_req, onText) {
      const body = responses[this.calls++] as unknown;
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      for (let i = 0; i < text.length; i += 17) onText(text.slice(i, i + 17));
      return {
        text,
        stopReason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'fake',
      };
    },
  };
}

describe('runDraft orchestration', () => {
  it('emits validated sections and finishes in one attempt when the response is clean', async () => {
    const events: SectionEvent[] = [];
    const llm = fakeLlm([goodResponse]);
    const out = await runDraft({
      llm,
      ctx,
      system: 's',
      userMessage: 'u',
      schema: {},
      onSection: (e) => events.push(e),
    });
    expect(llm.calls).toBe(1);
    expect(out.incomplete).toBe(false);
    expect(events.map((e) => e.name)).toEqual([
      'comp_read',
      'build',
      'counter_picks',
      'bans',
      'game_plan',
    ]);
  });

  it('retries once with the errors, replaces the failed section, then strips what is still invalid', async () => {
    const bad = structuredClone(goodResponse);
    bad.build.items.push({ id: 'infinity_edge', reason: 'x' });
    const events: SectionEvent[] = [];
    const fixed = await runDraft({
      llm: fakeLlm([bad, goodResponse]),
      ctx,
      system: 's',
      userMessage: 'u',
      schema: {},
      onSection: (e) => events.push(e),
    });
    expect(fixed.attempts).toBe(2);
    expect(fixed.incomplete).toBe(false);
    expect(events.find((e) => e.name === 'build')).toMatchObject({ attempt: 2, replaces: true });

    const stillBad = await runDraft({
      llm: fakeLlm([bad, bad]),
      ctx,
      system: 's',
      userMessage: 'u',
      schema: {},
    });
    expect(stillBad.attempts).toBe(2);
    expect(stillBad.incomplete).toBe(true);
    expect(stillBad.response.build.items.map((i) => i.id)).not.toContain('infinity_edge');
    expect(stillBad.removed.some((p) => p.id === 'infinity_edge')).toBe(true);
  });

  it('does not retry a refusal', async () => {
    const llm: LlmClient & { calls: number } = {
      calls: 0,
      async streamJson() {
        this.calls++;
        return { text: '', stopReason: 'refusal', usage: {}, model: 'fake' };
      },
    };
    const out = await runDraft({ llm, ctx, system: 's', userMessage: 'u', schema: {} });
    expect(llm.calls).toBe(1);
    expect(out.refused).toBe(true);
    expect(out.response.build.items).toEqual([]);
  });
});

it('structured output schema injects per-patch enums and strips unsupported keywords', () => {
  const schema = draftOutputSchema(index) as {
    properties: Record<string, { properties: Record<string, unknown> }>;
  };
  const text = JSON.stringify(schema);
  expect(text).not.toMatch(/"(minimum|maximum|minLength|maxLength|pattern|minItems|maxItems)"/);
  expect(text).toContain('fx_anti_heal_ap');
  const objects = text.match(/"type":"object"/g)?.length ?? 0;
  const closed = text.match(/"additionalProperties":false/g)?.length ?? 0;
  expect(closed).toBe(objects);
});
