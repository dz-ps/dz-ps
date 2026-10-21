import type { CatalogIndex } from '../catalog/index.ts';
import { ROLES, type Role } from '../schemas/common.ts';
import type { MetaBundle, MetaStat } from '../schemas/meta.ts';

/**
 * "Campeões em alta" (spec §5.3): best win rate per role among picks with a meaningful pick rate.
 * The app (Home) and the meta-tips generator use the same selection, so tips match what the user sees.
 */
export function trendingByRole(
  meta: MetaBundle | null | undefined,
  index: CatalogIndex | null | undefined,
  opts: {
    rankTier?: string | null;
    minPick?: number;
    perRole?: number;
    roles?: readonly Role[];
  } = {},
): MetaStat[] {
  if (!meta) return [];
  const tier =
    opts.rankTier && meta.rank_tiers.includes(opts.rankTier) ? opts.rankTier : meta.rank_tiers[0];
  const minPick = opts.minPick ?? 2;
  const perRole = opts.perRole ?? 1;
  return (opts.roles ?? ROLES).flatMap((role) =>
    meta.stats
      .filter(
        (s) =>
          s.role === role &&
          s.rank_tier === tier &&
          s.pick_rate >= minPick &&
          (!index || index.champions.has(s.champion_id)),
      )
      .sort((a, b) => b.win_rate - a.win_rate || b.pick_rate - a.pick_rate)
      .slice(0, perRole),
  );
}
