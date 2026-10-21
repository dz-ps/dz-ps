import { displayName, suggestBans, type BanSuggestion } from '@riftbuild/shared';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { SourceBadge } from '@/components/catalog/SourceBadge';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { loadProfile } from '@/features/profile/profile';
import { ROLE_LABEL } from '@/i18n/labels';

/** Ban suggestions before the draft (spec §5.5): patch strength in my elo, my role, my loss log. */
export default function BansScreen() {
  const { index, meta, store } = useCatalog();
  const [lossLog, setLossLog] = useState<Record<string, number>>({});
  const profile = loadProfile();
  useFocusEffect(useCallback(() => void store.getLossLog().then(setLossLog), [store]));

  const bans = useMemo<BanSuggestion[]>(
    () =>
      index
        ? suggestBans({
            index,
            meta,
            elo: profile.elo,
            myRole: profile.role,
            mains: profile.mains,
            lossLog,
            exclude: [],
            limit: 6,
          })
        : [],
    [index, meta, profile.elo, profile.role, profile.mains, lossLog],
  );

  return (
    <Screen testID="screen-bans">
      <Stack.Screen options={{ title: 'Bans sugeridos' }} />
      <DataBanners />
      <AppText variant="caption">
        Baseado nos campeões mais fortes do patch{profile.elo ? ` em ${profile.elo}` : ''}
        {profile.role ? `, na sua rota (${ROLE_LABEL[profile.role]})` : ''} e nas derrotas que você
        registrou.
      </AppText>
      {!profile.role || !profile.elo ? (
        <Button
          label="Configurar rota e elo no perfil"
          kind="secondary"
          onPress={() => router.push('/profile')}
        />
      ) : null}
      {bans.map((ban) => {
        const champ = index?.champions.get(ban.championId);
        if (!champ) return null;
        return (
          <Card key={ban.championId} testID={`ban-${ban.championId}`} className="gap-1">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/champion/${champ.id}`)}
              className="min-h-touch flex-row items-center gap-3"
            >
              <EntityIcon
                icon={champ.icon}
                name={displayName(champ)}
                size={48}
                details={{ kind: 'champion', id: champ.id }}
              />
              <View className="flex-1">
                <AppText className="font-semibold">{displayName(champ)}</AppText>
                <AppText variant="caption">{ban.reason_pt}</AppText>
              </View>
            </Pressable>
            {ban.source_url && meta ? (
              <SourceBadge url={ban.source_url} collectedAt={meta.collected_at} />
            ) : null}
          </Card>
        );
      })}
      {bans.length === 0 ? (
        <AppText variant="caption">Sem dados suficientes para sugerir bans.</AppText>
      ) : null}
    </Screen>
  );
}
