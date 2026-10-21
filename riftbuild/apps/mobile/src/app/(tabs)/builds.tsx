import { displayName } from '@riftbuild/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import type { SavedBuild } from '@/data/store/types';
import { ROLE_LABEL } from '@/i18n/labels';

export default function BuildsScreen() {
  const { store, index } = useCatalog();
  const [builds, setBuilds] = useState<SavedBuild[]>([]);
  const reload = useCallback(() => void store.listBuilds().then(setBuilds), [store]);
  useFocusEffect(reload);

  const sorted = [...builds].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return (
    <Screen testID="screen-builds">
      <DataBanners />
      <Button
        testID="new-build"
        label="Nova build"
        size="lg"
        disabled={!index}
        onPress={() => router.push('/build/new')}
      />
      {sorted.length === 0 ? (
        <AppText variant="caption">
          Nenhuma build salva ainda. As builds ficam só no seu aparelho.
        </AppText>
      ) : null}
      {sorted.map((saved) => {
        const champ = saved.build.championId
          ? index?.champions.get(saved.build.championId)
          : undefined;
        return (
          <Card key={saved.id} className="gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir build ${saved.name}`}
              onPress={() => router.push(`/build/${saved.id}`)}
              className="min-h-touch flex-row items-center gap-3"
            >
              {champ ? <EntityIcon icon={champ.icon} name={displayName(champ)} size={48} /> : null}
              <View className="flex-1">
                <AppText className="font-semibold">
                  {saved.favorite ? '★ ' : ''}
                  {saved.name}
                </AppText>
                <AppText variant="caption">
                  {champ ? displayName(champ) : 'Sem campeão'}
                  {saved.build.role ? ` · ${ROLE_LABEL[saved.build.role]}` : ''} · patch{' '}
                  {saved.patch}
                  {index && saved.patch !== index.patch ? ' (patch antigo)' : ''}
                </AppText>
              </View>
            </Pressable>
            <View className="flex-row gap-1">
              {saved.build.items.filter(Boolean).map((id, i) => {
                const item = index?.items.get(id!);
                return item ? (
                  <EntityIcon
                    key={`${id}-${i}`}
                    icon={item.icon}
                    name={displayName(item)}
                    size={36}
                    details={{ kind: 'item', id: item.id }}
                  />
                ) : null;
              })}
            </View>
            <Button
              label="Apagar"
              kind="ghost"
              accessibilityLabel={`Apagar build ${saved.name}`}
              onPress={() => void store.deleteBuild(saved.id).then(reload)}
            />
          </Card>
        );
      })}
    </Screen>
  );
}
