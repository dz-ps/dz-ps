import fc from 'fast-check';
import { expect, it } from 'vitest';
import { emptyBuild } from '../rules/types.ts';
import { decodeBuild, encodeBuild } from './buildCode.ts';

it('round-trips a build through a URL-safe code', () => {
  const build = emptyBuild(6);
  build.championId = 'warwick';
  build.role = 'jungle';
  build.items = ['mercurys_treads', 'nashors_tooth', null, null, null, null];
  build.runes = {
    keystone: 'conqueror',
    primaryPath: 'precision',
    primary: ['triumph', 'cut_down', 'legend_haste'],
    secondary: 'bone_plating',
  };
  build.spells = ['smite', 'flash'];
  build.skillOrder = ['Q', 'W', 'E'];
  const code = encodeBuild(build, '7.3b');
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeBuild(code)).toEqual({ patch: '7.3b', build });
});

it('rejects garbage and injected values', () => {
  expect(decodeBuild('not*base64')).toBeNull();
  expect(decodeBuild('e30')).toBeNull(); // "{}"
  fc.assert(fc.property(fc.string(), (s) => void decodeBuild(s)));
});
