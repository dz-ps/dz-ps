import { displayName } from '@riftbuild/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { SourceBadge } from '@/components/catalog/SourceBadge';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { StatValue } from '@/features/meta/StatValue';
import { useMetaTips, useTrending } from '@/features/meta/useMeta';
import { t } from '@/i18n/pt-BR';
import { formatDate, ROLE_LABEL } from '@/i18n/labels';
import { prefs } from '@/lib/storage';

export default function HomeScreen() {
  const { index, release, gamePatch, syncing, lastCheckedAt } = useCatalog();
  const trending = useTrending(prefs.getString('meta.elo') ?? null);
  const tipsByRole = useMetaTips();
  const anyTips = trending.some((s) =>
    tipsByRole[s.role]?.tips.some((t) => t.champion_id === s.champion_id),
  );
  return (
    <Screen testID="screen-home">
      <DataBanners />
      <Card className="gap-1" testID="patch-card">
        <AppText variant="label">{t.home.currentPatch}</AppText>
        <AppText variant="title">{gamePatch ?? index?.patch ?? '—'}</AppText>
        <AppText variant="caption">
          {index ? `Dados do patch ${index.patch}` : 'Sem dados baixados'}
          {lastCheckedAt ? ` · verificado em ${formatDate(lastCheckedAt)}` : ''}
          {syncing ? ' · atualizando…' : ''}
        </AppText>
        {release?.manifest.game_patch.source_url ? (
          <SourceBadge
            url={release.manifest.game_patch.source_url}
            collectedAt={release.manifest.game_patch.detected_at}
          />
        ) : null}
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">{t.home.analyzeDraft}</AppText>
        <AppText variant="caption">{t.home.analyzeDraftHint}</AppText>
        <Button
          testID="cta-draft"
          label={t.home.analyzeDraft}
          size="lg"
          onPress={() => router.push('/draft')}
        />
        <Button label="Sugerir bans" kind="secondary" onPress={() => router.push('/bans')} />
      </Card>

      {trending.length ? (
        <Card className="gap-2">
          <AppText variant="heading">{t.home.trending}</AppText>
          {trending.map((s) => {
            const champ = index?.champions.get(s.champion_id);
            if (!champ) return null;
            const tip = tipsByRole[s.role]?.tips.find((t) => t.champion_id === champ.id);
            return (
              <View key={s.role} className="gap-1">
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
                    <AppText variant="caption">
                      {ROLE_LABEL[s.role]} · {s.rank_tier}
                    </AppText>
                  </View>
                  <StatValue
                    testID={`stat-trend-${s.role}`}
                    label="Vitória"
                    value={s.win_rate}
                    source={s.source_url}
                    collectedAt={s.collected_at}
                  />
                </Pressable>
                {tip ? (
                  <View testID={`tips-${s.role}`} className="ml-[60px] gap-0.5">
                    {tip.power_spikes.length ? (
                      <AppText variant="caption">
                        <AppText variant="caption" className="font-semibold">
                          Picos de poder:{' '}
                        </AppText>
                        {tip.power_spikes.join(' · ')}
                      </AppText>
                    ) : null}
                    {tip.combos.length ? (
                      <AppText variant="caption">
                        <AppText variant="caption" className="font-semibold">
                          Combos:{' '}
                        </AppText>
                        {tip.combos.join(' · ')}
                      </AppText>
                    ) : null}
                    {tip.common_mistakes.length ? (
                      <AppText variant="caption">
                        <AppText variant="caption" className="font-semibold">
                          Erros comuns:{' '}
                        </AppText>
                        {tip.common_mistakes.join(' · ')}
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {anyTips && index ? (
            <AppText variant="caption">
              Dicas geradas por IA uma vez por patch ({index.patch}), a partir das habilidades
              oficiais. Podem conter imprecisões.
            </AppText>
          ) : null}
          {trending[0] ? (
            <SourceBadge url={trending[0].source_url} collectedAt={trending[0].collected_at} />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
