import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fixtureIndex } from '../../test/fixtures.ts';
import { MetaBundle } from '../schemas/meta.ts';
import { trendingByRole } from '../meta/trending.ts';
import {
  buildTipsUserMessage,
  tipChampions,
  tipsCacheKey,
  tipsOutputSchema,
  validateTips,
} from './tips.ts';

const index = fixtureIndex();
const meta = MetaBundle.parse(
  JSON.parse(
    readFileSync(
      new URL('../../../../contracts/fixtures/valid/meta.fixture.json', import.meta.url),
      'utf8',
    ),
  ),
);

describe('trendingByRole', () => {
  it('picks the best win rate per role above the pick-rate floor', () => {
    const rows = trendingByRole(meta, index);
    expect(rows.map((r) => [r.role, r.champion_id])).toEqual([['jungle', 'fx_tank']]);
    expect(trendingByRole(meta, index, { minPick: 50 })).toEqual([]);
    expect(trendingByRole(null, index)).toEqual([]);
  });
});

describe('meta tips', () => {
  it('asks only about trending champions of the role, with their own abilities', () => {
    const ids = tipChampions(index, meta, 'jungle');
    expect(ids).toEqual(['fx_tank']);
    const msg = JSON.parse(buildTipsUserMessage(index, meta, 'jungle', ids));
    expect(msg.campeoes[0].id).toBe('fx_tank');
    expect(msg.campeoes[0].habilidades.length).toBeGreaterThan(0);
    const schema = tipsOutputSchema(ids) as {
      properties: { tips: { items: { properties: { champion_id: { enum: string[] } } } } };
    };
    expect(schema.properties.tips.items.properties.champion_id.enum).toEqual(['fx_tank']);
    expect(tipsCacheKey('7.3b', 'jungle')).toBe('tips:7.3b:jungle');
  });

  it('drops unknown or unrequested champions, duplicates and overlong lines', () => {
    const raw = {
      patch: 'whatever',
      role: 'jungle',
      tips: [
        {
          champion_id: 'fx_tank',
          power_spikes: ['Nível 5 com a R', '', 'x'.repeat(400), 'a', 'b', 'c'],
          combos: ['E > Q'],
          common_mistakes: [],
        },
        { champion_id: 'fx_tank', power_spikes: ['dup'], combos: [], common_mistakes: [] },
        { champion_id: 'garen', power_spikes: ['not in catalog'], combos: [], common_mistakes: [] },
        { champion_id: 'fx_healer', power_spikes: ['not asked'], combos: [], common_mistakes: [] },
      ],
      missing_data: [],
    };
    const out = validateTips(raw, { index, role: 'jungle', allowed: ['fx_tank'] })!;
    expect(out.patch).toBe(index.patch);
    expect(out.tips).toHaveLength(1);
    expect(out.tips[0]!.power_spikes).toEqual(['Nível 5 com a R', 'a', 'b']);
    expect(validateTips({ nope: true }, { index, role: 'jungle' })).toBeNull();
    expect(validateTips(raw, { index, role: 'jungle', requirePatch: true })).toBeNull();
    expect(validateTips(out, { index, role: 'jungle', requirePatch: true })).toEqual(out);
  });
});
