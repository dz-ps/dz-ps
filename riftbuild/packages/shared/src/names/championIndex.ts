import type { CatalogIndex } from '../catalog/index.ts';
import { buildSearchIndex, type SearchEntry, type SearchIndex } from './matcher.ts';

/** Search index over champions: pt-BR and English names, the ID, and the alias table (bundle + admin). */
export function championSearchIndex(
  index: CatalogIndex,
  extraAliases: Record<string, string> = {},
): SearchIndex {
  const aliasesById = new Map<string, string[]>();
  for (const [alias, id] of Object.entries({ ...index.aliases, ...extraAliases })) {
    if (!index.champions.has(id)) continue;
    aliasesById.set(id, [...(aliasesById.get(id) ?? []), alias]);
  }
  const entries: SearchEntry[] = [...index.champions.values()].map((c) => ({
    id: c.id,
    names: [c.name_en, ...(c.name_pt ? [c.name_pt] : [])],
    aliases: [...c.aliases, ...(aliasesById.get(c.id) ?? [])],
  }));
  return buildSearchIndex(entries);
}
