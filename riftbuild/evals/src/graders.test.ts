import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  analyzeComp,
  CatalogBundle,
  indexCatalog,
  selectCandidates,
} from '../../packages/shared/src/index.ts';
import { grade, type Case } from './graders.ts';

const bundle = CatalogBundle.parse(
  JSON.parse(
    readFileSync(
      new URL('../../contracts/fixtures/valid/catalog.fixture.json', import.meta.url),
      'utf8',
    ),
  ),
);
const index = indexCatalog(bundle);
const comp = analyzeComp(['fx_healer', 'fx_tank'], index);
const det = {
  comp,
  candidates: selectCandidates({ comp, myChampionId: null, role: null, style: [], index }),
  counters: [],
  bans: [],
  picked: ['fx_healer', 'fx_tank'],
};

it('fails when an expectation is not met and passes when it is', () => {
  const base: Case = { id: 'x', title: 'x', input: {} };
  const ctx = {
    index,
    mode: 'deterministic',
    parsedIds: [],
    invalid: null,
    det,
    ai: null,
    aiRaw: null,
    aiError: null,
  };
  expect(grade({ ...base, deterministic: { healers_include: ['fx_healer'] } }, ctx).status).toBe(
    'pass',
  );
  expect(grade({ ...base, deterministic: { healers_include: ['fx_tank'] } }, ctx).status).toBe(
    'fail',
  );
  expect(grade({ ...base, ai: { spells_include: ['smite'] } }, ctx).status).toBe('skipped');
});

it('flags ids outside the catalog in the raw AI answer', () => {
  const raw = {
    patch: '9.9z',
    comp_read: {
      damage: { physical: 0, magic: 0, true: 0 },
      hard_cc_count: 0,
      healing: 'nenhuma',
      threats: [],
    },
    build: {
      items: [{ id: 'infinity_edge', reason: '' }],
      boots: null,
      runes: null,
      spells: null,
      skill_order: null,
    },
    counter_picks: [],
    bans: [],
    game_plan: [],
    confidence: 'baixa',
    missing_data: [],
  } as const;
  const ctx = {
    index,
    mode: 'replay',
    parsedIds: [],
    invalid: null,
    det,
    ai: { ...raw, build: { ...raw.build, items: [] } },
    aiRaw: raw,
    aiError: null,
  };
  const out = grade({ id: 'y', title: 'y', input: {}, ai: { no_invalid_ids: true } }, ctx as never);
  expect(out.status).toBe('fail');
});
