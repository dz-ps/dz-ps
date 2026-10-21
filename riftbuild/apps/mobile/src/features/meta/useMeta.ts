import {
  ROLES,
  trendingByRole,
  type AiMetaTips,
  type MetaStat,
  type Role,
} from '@riftbuild/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { fetchMetaTips } from '@/data/remote/tips';
import { env } from '@/lib/env';

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

/** "Campeões em alta": same selection as the server-side tips generator (shared trendingByRole). */
export function useTrending(rankTier: string | null, minPick = 2): MetaStat[] {
  const { meta, index } = useCatalog();
  return useMemo(
    () => trendingByRole(meta, index, { rankTier, minPick }),
    [meta, index, rankTier, minPick],
  );
}

/** AI tips per role for the current catalog patch, when the scheduled job has generated them. */
export function useMetaTips(): Partial<Record<Role, AiMetaTips>> {
  const { index } = useCatalog();
  const { data } = useQuery({
    queryKey: ['meta-tips', index?.patch],
    enabled: !!index && env.hasBackend,
    queryFn: async () => {
      const entries = await Promise.all(
        ROLES.map(async (role) => [role, await fetchMetaTips(role, index!)] as const),
      );
      return Object.fromEntries(entries.filter(([, tips]) => tips?.tips.length)) as Partial<
        Record<Role, AiMetaTips>
      >;
    },
  });
  return data ?? {};
}
