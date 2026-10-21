import { CatalogBundle, Manifest, MetaBundle } from '@riftbuild/shared';
import catalogJson from '../../../../contracts/fixtures/valid/catalog.fixture.json';
import manifestJson from '../../../../contracts/fixtures/valid/manifest.fixture.json';
import metaJson from '../../../../contracts/fixtures/valid/meta.fixture.json';
import type { StoredRelease } from '@/data/store/types';

/**
 * Test release built from the synthetic contract fixtures (fx_* entities, fixture: true). One test-only
 * champion named after a real one ("Amumu") is added so the spec's search example can be exercised;
 * none of this is ever shipped (scripts/check-forbidden-sources.mjs refuses fixtures in app assets).
 */
export function testRelease(overrides: { gamePatch?: string } = {}): StoredRelease {
  const catalog = structuredClone(catalogJson) as Record<string, unknown> & {
    champions: Record<string, unknown>[];
    items: Record<string, unknown>[];
    aliases: Record<string, string>;
  };
  const tank = catalog.champions.find((c) => c.id === 'fx_tank')!;
  catalog.champions.push({
    ...structuredClone(tank),
    id: 'amumu',
    name_en: 'Amumu',
    name_pt: 'Amumu',
  });
  catalog.aliases = { ...catalog.aliases, mumu: 'amumu' };
  const staff = catalog.items.find((i) => i.id === 'fx_anti_heal_ap')!;
  staff.recipe = ['fx_component'];
  const manifest = Manifest.parse({
    ...manifestJson,
    game_patch: { ...manifestJson.game_patch, version: overrides.gamePatch ?? '9.9z' },
    icons_base: 'https://example.invalid/icons/',
  });
  return {
    catalog: CatalogBundle.parse(catalog),
    catalogHash: manifest.catalog!.hash,
    meta: MetaBundle.parse(metaJson),
    metaHash: null,
    manifest,
    savedAt: '2026-01-01T00:00:00.000Z',
  };
}
