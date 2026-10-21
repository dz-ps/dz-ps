import { buildSearchIndex, displayName, search, type SearchIndex } from '@riftbuild/shared';
import { useMemo } from 'react';

type Named = { id: string; name_en: string; name_pt: string | null };

/** Fuzzy search (pt-BR, English, id) over any catalog entity list, reusing the shared matcher. */
export function useEntitySearch<T extends Named>(
  entities: T[],
  query: string,
  index?: SearchIndex | null,
): T[] {
  const searchIndex = useMemo(
    () =>
      index ??
      buildSearchIndex(
        entities.map((e) => ({ id: e.id, names: [e.name_en, ...(e.name_pt ? [e.name_pt] : [])] })),
      ),
    [entities, index],
  );
  return useMemo(() => {
    if (!query.trim())
      return [...entities].sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
    const byId = new Map(entities.map((e) => [e.id, e]));
    return search(query, searchIndex)
      .map((m) => byId.get(m.id))
      .filter((e): e is T => !!e);
  }, [entities, query, searchIndex]);
}
