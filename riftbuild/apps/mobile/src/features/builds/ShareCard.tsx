import { displayName, type UserBuild } from '@riftbuild/shared';
import type { ComponentRef, Ref } from 'react';
import { View } from 'react-native';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { ROLE_LABEL } from '@/i18n/labels';

/** Image card captured with react-native-view-shot and shared to WhatsApp/Discord (spec §5.2, §7). */
export type ShareCardRef = ComponentRef<typeof View>;

export function ShareCard({
  build,
  name,
  ref,
}: {
  build: UserBuild;
  name: string;
  ref?: Ref<ShareCardRef>;
}) {
  const { index } = useCatalog();
  if (!index) return null;
  const champ = build.championId ? index.champions.get(build.championId) : undefined;
  const items = build.items
    .filter((i): i is string => !!i)
    .map((id) => index.items.get(id))
    .filter((i) => !!i);
  const keystone = build.runes.keystone ? index.runes.get(build.runes.keystone) : undefined;
  const spells = build.spells.map((s) => (s ? index.spells.get(s) : undefined)).filter((s) => !!s);
  return (
    <View
      ref={ref}
      collapsable={false}
      testID="share-card"
      className="w-[360px] gap-3 rounded-2xl border border-accent bg-bg p-4"
    >
      <View className="flex-row items-center gap-3">
        {champ ? <EntityIcon icon={champ.icon} name={displayName(champ)} size={56} /> : null}
        <View className="flex-1">
          <AppText variant="heading">{name || 'Minha build'}</AppText>
          <AppText variant="caption">
            {champ ? displayName(champ) : 'Sem campeão'}
            {build.role ? ` · ${ROLE_LABEL[build.role]}` : ''} · patch {index.patch}
          </AppText>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-1">
        {items.map((item) => (
          <EntityIcon key={item!.id} icon={item!.icon} name={displayName(item!)} size={48} />
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        {keystone ? (
          <EntityIcon icon={keystone.icon} name={displayName(keystone)} size={40} rounded />
        ) : null}
        {spells.map((s) => (
          <EntityIcon key={s!.id} icon={s!.icon} name={displayName(s!)} size={40} />
        ))}
        {build.skillOrder.length ? (
          <AppText className="ml-2 font-semibold">{build.skillOrder.join(' > ')}</AppText>
        ) : null}
      </View>
      <AppText variant="caption" className="text-[10px]">
        RiftBuild · projeto de fã não oficial. Wild Rift © Riot Games.
      </AppText>
    </View>
  );
}
