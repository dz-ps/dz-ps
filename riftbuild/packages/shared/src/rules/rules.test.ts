import { describe, expect, it } from 'vitest';
import { fixtureIndex } from '../../test/fixtures.ts';
import { computeTotals, cumulativeCosts } from '../stats/statCalculator.ts';
import { canAddItem, validateItems } from './buildValidator.ts';
import { isRunePageValid, validateRunePage } from './runeValidator.ts';
import { validateSpells } from './spellValidator.ts';
import { emptyBuild, type RunePage } from './types.ts';
import { validateBuild } from './validateBuild.ts';

const index = fixtureIndex();

describe('item rules', () => {
  it('blocks a second pair of boots', () => {
    const build = emptyBuild(index.rules.item_slots);
    build.items[0] = 'fx_boots_a';
    const check = canAddItem(build, 'fx_boots_b', index);
    expect(check).toMatchObject({ ok: false, code: 'SECOND_BOOTS' });
    expect(canAddItem(build, 'fx_mr_item', index)).toEqual({ ok: true });
  });

  it('warns (does not block) when unique passives do not stack', () => {
    const build = emptyBuild(index.rules.item_slots);
    build.items[0] = 'fx_item_spellblade_1';
    expect(canAddItem(build, 'fx_item_spellblade_2', index)).toEqual({ ok: true });
    build.items[1] = 'fx_item_spellblade_2';
    const { errors, warnings } = validateItems(build, index);
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatchObject({ code: 'UNIQUE_GROUP_OVERLAP' });
    expect(warnings[0]!.message_pt).toContain('Spellblade');
  });

  it('enforces item limits, slot count and catalog membership', () => {
    const build = emptyBuild(index.rules.item_slots);
    build.items[0] = 'fx_limited';
    expect(canAddItem(build, 'fx_limited', index)).toMatchObject({ ok: false, code: 'ITEM_LIMIT' });
    const full = emptyBuild(2);
    full.items = ['fx_mr_item', 'fx_component'];
    expect(canAddItem(full, 'fx_anti_heal_ap', index)).toMatchObject({
      ok: false,
      code: 'TOO_MANY_ITEMS',
    });
    expect(canAddItem(emptyBuild(6), 'infinity_edge', index)).toMatchObject({
      ok: false,
      code: 'NOT_IN_CATALOG',
    });
  });
});

const valid: RunePage = {
  keystone: 'fx_keystone_a',
  primaryPath: 'domination',
  primary: ['fx_domination_1_a', 'fx_domination_2_b', 'fx_domination_3_a'],
  secondary: 'fx_resolve_2_a',
};

describe('rune page rules (bundle.rules.rune_page)', () => {
  it('accepts a valid page', () => {
    expect(validateRunePage(valid, index)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['missing keystone', { ...valid, keystone: null }, 'RUNE_KEYSTONE_MISSING'],
    [
      'minor rune as keystone',
      { ...valid, keystone: 'fx_domination_1_a' },
      'RUNE_KEYSTONE_INVALID',
    ],
    ['no primary path', { ...valid, primaryPath: null }, 'RUNE_PATH_MISSING'],
    [
      'wrong slot order',
      { ...valid, primary: ['fx_domination_2_a', 'fx_domination_1_a', 'fx_domination_3_a'] },
      'RUNE_PRIMARY_INVALID',
    ],
    [
      'primary from another path',
      { ...valid, primary: ['fx_resolve_1_a', 'fx_domination_2_a', 'fx_domination_3_a'] },
      'RUNE_PRIMARY_INVALID',
    ],
    [
      'missing primary rune',
      { ...valid, primary: ['fx_domination_1_a', null, 'fx_domination_3_a'] },
      'RUNE_PRIMARY_INVALID',
    ],
    [
      'secondary from the primary path',
      { ...valid, secondary: 'fx_domination_2_a' },
      'RUNE_SECONDARY_SAME_PATH',
    ],
    ['keystone as secondary', { ...valid, secondary: 'fx_keystone_b' }, 'RUNE_SECONDARY_INVALID'],
    ['missing secondary', { ...valid, secondary: null }, 'RUNE_SECONDARY_INVALID'],
    ['unknown rune', { ...valid, secondary: 'conqueror' }, 'RUNE_SECONDARY_INVALID'],
  ] as const)('rejects %s', (_label, page, code) => {
    expect(isRunePageValid(page as RunePage, index)).toBe(false);
    expect(validateRunePage(page as RunePage, index).errors.map((e) => e.code)).toContain(code);
  });
});

describe('summoner spells', () => {
  it('requires Smite in the jungle and forbids jungle-only spells elsewhere', () => {
    expect(validateSpells(['flash', 'ignite'], 'jungle', index).errors[0]?.code).toBe(
      'SPELL_JUNGLE_REQUIRED',
    );
    expect(validateSpells(['smite', 'flash'], 'jungle', index).errors).toEqual([]);
    expect(validateSpells(['smite', 'flash'], 'mid', index).errors[0]?.code).toBe(
      'SPELL_JUNGLE_ONLY',
    );
    expect(validateSpells(['flash', 'flash'], 'mid', index).errors[0]?.code).toBe(
      'SPELL_DUPLICATE',
    );
    expect(
      validateSpells(['chilling_smite', 'flash'], 'jungle', index).errors.map((e) => e.code),
    ).toContain('SPELL_NOT_SELECTABLE');
  });
});

it('validateBuild combines every rule', () => {
  const build = emptyBuild(index.rules.item_slots);
  build.championId = 'fx_tank';
  build.role = 'jungle';
  build.items = ['fx_boots_b', 'fx_mr_item', null, null, null, null];
  build.runes = valid;
  build.spells = ['smite', 'flash'];
  expect(validateBuild(build, index)).toEqual({ errors: [], warnings: [] });
});

describe('stat totals', () => {
  it('adds base stats, linear growth (estimate) and items', () => {
    const lvl1 = computeTotals('fx_tank', 1, ['fx_mr_item'], index);
    expect(lvl1.totals.hp).toBe(900);
    expect(lvl1.totals.mr).toBe(92);
    expect(lvl1.estimated).toBe(false);
    const lvl5 = computeTotals('fx_tank', 5, ['fx_mr_item', 'fx_boots_b'], index);
    expect(lvl5.totals.hp).toBe(600 + 100 * 4 + 300);
    expect(lvl5.totals.tenacity).toBe(30);
    expect(lvl5.totals.attack_speed).toBeCloseTo(0.7 * (1 + (2 * 4) / 100), 3);
    expect(lvl5.estimated).toBe(true);
  });

  it('clamps the level to the rules and reports cumulative costs', () => {
    expect(computeTotals('fx_tank', 99, [], index).level).toBe(index.rules.max_level);
    expect(cumulativeCosts(['fx_component', 'fx_anti_heal_ap'], index)).toEqual([400, 2900]);
  });
});
