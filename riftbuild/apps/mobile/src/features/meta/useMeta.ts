import type { MetaStat, Role } from '@riftbuild/shared';
import { useMemo } from 'react';
import { useCatalog } from '@/data/catalog/CatalogProvider';

export type TierRow = MetaStat & { rank: number };

/** Tier list for a role and rank tier: source tier first (as published), then win rate. */
export function useTierList(
  role: Role,
  rankTier: string | null,
): { rows: TierRow[]; tiers: string[] } {
  const { meta, index } = useCatalog();
  return useMemo(() => {
    const tiers = meta?.rank_tiers ?? [];
    const tier = rankTier && tiers.includes(rankTier) ? rankTier : tiers[0];
    const rows = (meta?.stats ?? [])
      .filter((s) => s.role === role && s.rank_tier === tier && index?.champions.has(s.champion_id))
      .sort((a, b) => (a.source_tier ?? 99) - (b.source_tier ?? 99) || b.win_rate - a.win_rate)
      .map((s, i) => ({ ...s, rank: i + 1 }));
    return { rows, tiers };
  }, [meta, index, role, rankTier]);
}

/** "Campeões em alta": best win rate per role among picks with a meaningful pick rate. */
export function useTrending(rankTier: string | null, minPick = 2): MetaStat[] {
  const { meta, index } = useCatalog();
  return useMemo(() => {
    if (!meta) return [];
    const tier = rankTier ?? meta.rank_tiers[0];
    const roles: Role[] = ['baron', 'jungle', 'mid', 'dragon', 'support'];
    return roles
      .map(
        (role) =>
          meta.stats
            .filter(
              (s) =>
                s.role === role &&
                s.rank_tier === tier &&
                s.pick_rate >= minPick &&
                index?.champions.has(s.champion_id),
            )
            .sort((a, b) => b.win_rate - a.win_rate)[0],
      )
      .filter((s): s is MetaStat => !!s);
  }, [meta, index, rankTier, minPick]);
}
