import { readFileSync } from 'node:fs';
import { indexCatalog, type CatalogIndex } from '../src/catalog/index.ts';
import { CatalogBundle } from '../src/schemas/catalog.ts';

/** Synthetic fixture catalog (fx_* entities, fixture: true): contracts/fixtures/valid/catalog.fixture.json. */
export function fixtureIndex(): CatalogIndex {
  const raw = readFileSync(
    new URL('../../../contracts/fixtures/valid/catalog.fixture.json', import.meta.url),
    'utf8',
  );
  return indexCatalog(CatalogBundle.parse(JSON.parse(raw)));
}
