import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexCatalog } from '../catalog/index.ts';
import { CatalogBundle } from '../schemas/catalog.ts';
import { championSearchIndex } from './championIndex.ts';
import { buildSearchIndex, search } from './matcher.ts';
import { editDistance, normalizeName } from './normalize.ts';
import { parseChampions } from './parser.ts';

const contracts = new URL('../../../../contracts/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases/normalize-name.json', contracts), 'utf8')) as {
  cases: [string, string][];
};

describe('normalizeName (contract: contracts/cases/normalize-name.json)', () => {
  it.each(cases.cases)('%s -> %s', (input, expected) =>
    expect(normalizeName(input)).toBe(expected),
  );
});

it('editDistance handles transpositions', () => {
  expect(editDistance('momu', 'mumu')).toBe(1);
  expect(editDistance('warike', 'warwick')).toBe(3); // why the alias table needs "warike"
  expect(editDistance('ab', 'ba')).toBe(1);
});

// Test-only name list (real champion names, as shown in-game) plus the alias table the spec asks for (§5.4).
// It is NOT shipped anywhere; the app only ever reads names from the published catalog.
const NAMES: [string, string, string?][] = [
  ['amumu', 'Amumu'],
  ['warwick', 'Warwick'],
  ['volibear', 'Volibear'],
  ['miss_fortune', 'Miss Fortune'],
  ['twisted_fate', 'Twisted Fate'],
  ['jarvan_iv', 'Jarvan IV'],
  ['dr_mundo', 'Dr. Mundo'],
  ['kaisa', "Kai'Sa"],
  ['soraka', 'Soraka'],
  ['jinx', 'Jinx'],
  ['mel', 'Mel'],
  ['master_yi', 'Master Yi', 'Mestre Yi'],
  ['bard', 'Bard', 'Bardo'],
];
const SPEC_ALIASES: Record<string, string> = {
  mumu: 'amumu',
  momu: 'amumu',
  ww: 'warwick',
  warike: 'warwick',
  voli: 'volibear',
  mf: 'miss_fortune',
  tf: 'twisted_fate',
  j4: 'jarvan_iv',
  mundo: 'dr_mundo',
};
const testIndex = buildSearchIndex(
  NAMES.map(([id, en, pt]) => ({
    id,
    names: [en, ...(pt ? [pt] : [])],
    aliases: Object.entries(SPEC_ALIASES)
      .filter(([, target]) => target === id)
      .map(([alias]) => alias),
  })),
);

describe('champion search and draft text parsing', () => {
  it.each([
    ['mumu', 'amumu'],
    ['Momu', 'amumu'],
    ['WW', 'warwick'],
    ['Warike', 'warwick'],
    ['voli', 'volibear'],
    ['MF', 'miss_fortune'],
    ['TF', 'twisted_fate'],
    ['J4', 'jarvan_iv'],
    ['Mundo', 'dr_mundo'],
    ['Kaisa', 'kaisa'],
    ['bardo', 'bard'],
    ['mestre yi', 'master_yi'],
    ['sorak', 'soraka'],
  ])('%s -> %s', (query, id) => {
    expect(search(query, testIndex)[0]?.id).toBe(id);
  });

  it('parses the spec example in one go', () => {
    const result = parseChampions('soraka mumu jinx mel voli', testIndex);
    expect(result.resolved.map((r) => r.id)).toEqual([
      'soraka',
      'amumu',
      'jinx',
      'mel',
      'volibear',
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('keeps multi-word names together and separate names apart', () => {
    const result = parseChampions('miss fortune twisted fate, dr mundo jarvan iv mel', testIndex);
    expect(result.resolved.map((r) => r.id)).toEqual([
      'miss_fortune',
      'twisted_fate',
      'dr_mundo',
      'jarvan_iv',
      'mel',
    ]);
  });

  it('reports what it could not recognize and drops duplicates', () => {
    const result = parseChampions('jinx jinx xyzzy', testIndex);
    expect(result.resolved.map((r) => r.id)).toEqual(['jinx']);
    expect(result.unresolved).toEqual(['xyzzy']);
  });
});

const realCatalog = new URL('../../../../pipeline/out/catalog/latest.json', import.meta.url);
describe.skipIf(!existsSync(realCatalog))('against the real published catalog', () => {
  it('finds Amumu for "mumu" and parses the mandatory eval comp', () => {
    const bundle = CatalogBundle.parse(JSON.parse(readFileSync(realCatalog, 'utf8')));
    const index = championSearchIndex(indexCatalog(bundle));
    expect(search('mumu', index)[0]?.id).toBe('amumu');
    const parsed = parseChampions('soraka mumu jinx mel voli', index);
    expect(parsed.resolved.map((r) => r.id)).toEqual([
      'soraka',
      'amumu',
      'jinx',
      'mel',
      'volibear',
    ]);
  });
});
