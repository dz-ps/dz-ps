import { displayName, pct, type AiDraftResponse, type CatalogIndex } from '@riftbuild/shared';
import type { Ref } from 'react';
import { View } from 'react-native';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText } from '@/components/ui';
import type { ShareCardRef } from '@/features/builds/ShareCard';
import { ROLE_LABEL } from '@/i18n/labels';
import type { useDraftAnalysis } from './useDraftAnalysis';

type Result = NonNullable<ReturnType<typeof useDraftAnalysis>['deterministic']>;

/**
 * Draft analysis as an image for WhatsApp/Discord (spec §7). Only validated data: the deterministic read
 * and, when finished, the AI build that already passed the shared validator.
 */
export function DraftShareCard({
  result,
  ai,
  index,
  myChampion,
  myRole,
  ref,
}: {
  result: Result;
  ai: AiDraftResponse | null;
  index: CatalogIndex;
  myChampion: string | null;
  myRole: string | null;
  ref?: Ref<ShareCardRef>;
}) {
  const { comp, candidates } = result;
  const me = myChampion ? index.champions.get(myChampion) : undefined;
  const itemIds = ai?.build
    ? [...(ai.build.boots ? [ai.build.boots.id] : []), ...ai.build.items.map((i) => i.id)]
    : candidates.groups.flatMap((g) => g.itemIds.slice(0, 1));
  const items = [...new Set(itemIds)]
    .map((id) => index.items.get(id))
    .filter((i) => !!i)
    .slice(0, index.rules.item_slots);
  const threats = comp.threats.slice(0, 2).map((t) => index.champions.get(t.championId));
  return (
    <View
      ref={ref}
      collapsable={false}
      testID="draft-share-card"
      className="w-[360px] gap-3 rounded-2xl border border-accent bg-bg p-4"
    >
      <AppText variant="heading">Análise de draft · patch {index.patch}</AppText>
      <View className="flex-row gap-1">
        {comp.championIds.map((id) => {
          const c = index.champions.get(id);
          return c ? <EntityIcon key={id} icon={c.icon} name={displayName(c)} size={48} /> : null;
        })}
      </View>
      <AppText variant="caption">
        Dano {pct(comp.damage.physical * 100)}% físico · {pct(comp.damage.magic * 100)}% mágico ·
        controle pesado {comp.hardCcCount} · cura {comp.healing}
      </AppText>
      {threats.length ? (
        <AppText variant="caption">
          Ameaças:{' '}
          {threats
            .filter((c) => !!c)
            .map((c) => displayName(c!))
            .join(', ')}
        </AppText>
      ) : null}
      {items.length ? (
        <View className="gap-1">
          <AppText variant="label">
            {ai?.build ? 'Build sugerida' : 'Itens candidatos'}
            {me ? ` · ${displayName(me)}` : ''}
            {myRole && myRole in ROLE_LABEL
              ? ` · ${ROLE_LABEL[myRole as keyof typeof ROLE_LABEL]}`
              : ''}
          </AppText>
          <View className="flex-row flex-wrap gap-1">
            {items.map((item) => (
              <EntityIcon key={item!.id} icon={item!.icon} name={displayName(item!)} size={44} />
            ))}
          </View>
        </View>
      ) : null}
      {ai?.game_plan?.length ? (
        <AppText variant="caption">Plano: {ai.game_plan.slice(0, 2).join(' ')}</AppText>
      ) : null}
      <AppText variant="caption" className="text-[10px]">
        RiftBuild · projeto de fã não oficial. Wild Rift © Riot Games.
      </AppText>
    </View>
  );
}
