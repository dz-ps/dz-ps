import { displayName, ROLES, type Role } from '@riftbuild/shared';
import { FlashList } from '@shopify/flash-list';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BuffNerfTag } from '@/components/catalog/BuffNerfTag';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { SourceBadge } from '@/components/catalog/SourceBadge';
import { AppText, Card, Segmented } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { StatValue } from '@/features/meta/StatValue';
import { useTierList } from '@/features/meta/useMeta';
import { ROLE_LABEL } from '@/i18n/labels';
import { prefs } from '@/lib/storage';

type View_ = 'tiers' | 'changes';

export default function MetaScreen() {
  const [view, setView] = useState<View_>('tiers');
  return (
    <View testID="screen-meta" className="flex-1 gap-3 bg-bg px-4 pt-3">
      <DataBanners />
      <Segmented
        options={[
          { value: 'tiers', label: 'Tier list' },
          { value: 'changes', label: 'O que mudou' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'tiers' ? <TierList /> : <PatchChanges />}
    </View>
  );
}

function TierList() {
  const { index, meta } = useCatalog();
  const [role, setRole] = useState<Role>(() => (prefs.getString('meta.role') as Role) || 'mid');
  const [elo, setElo] = useState<string | null>(() => prefs.getString('meta.elo') ?? null);
  const { rows, tiers } = useTierList(role, elo);
  if (!meta || !index) return <AppText variant="caption">Sem dados de meta ainda.</AppText>;
  const current = elo && tiers.includes(elo) ? elo : tiers[0];
  return (
    <View className="flex-1 gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="max-h-14 flex-grow-0"
      >
        {ROLES.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="tab"
            accessibilityState={{ selected: role === r }}
            onPress={() => {
              setRole(r);
              prefs.setString('meta.role', r);
            }}
            className={`min-h-touch justify-center rounded-full border px-4 ${role === r ? 'border-accent' : 'border-border'}`}
          >
            <AppText className={role === r ? 'text-accent' : 'text-text'}>{ROLE_LABEL[r]}</AppText>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="max-h-14 flex-grow-0"
      >
        {tiers.map((tier) => (
          <Pressable
            key={tier}
            accessibilityRole="button"
            accessibilityLabel={`Elo ${tier}`}
            accessibilityState={{ selected: current === tier }}
            onPress={() => {
              setElo(tier);
              prefs.setString('meta.elo', tier);
            }}
            className={`min-h-touch justify-center rounded-lg border px-3 ${current === tier ? 'border-info' : 'border-border'}`}
          >
            <AppText className={`text-sm ${current === tier ? 'text-info' : 'text-muted'}`}>
              {tier}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
      <AppText variant="caption">
        {meta.source_name}: {meta.source_note} Nível (T0, T1…) conforme a classificação da fonte.
      </AppText>
      <View className="flex-1">
        <FlashList
          testID="tier-list"
          data={rows}
          keyExtractor={(r) => `${r.champion_id}-${r.role}`}
          ListEmptyComponent={<AppText variant="caption">Sem dados para esta rota e elo.</AppText>}
          ListFooterComponent={
            rows[0] ? (
              <SourceBadge url={rows[0].source_url} collectedAt={rows[0].collected_at} />
            ) : null
          }
          renderItem={({ item: r }) => {
            const champ = index.champions.get(r.champion_id)!;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/champion/${champ.id}`)}
                className="min-h-touch flex-row items-center gap-3 border-b border-border py-2"
              >
                <AppText className="w-8 text-center font-bold text-accent">
                  {r.source_tier !== null ? `T${r.source_tier}` : '—'}
                </AppText>
                <EntityIcon
                  icon={champ.icon}
                  name={displayName(champ)}
                  size={44}
                  details={{ kind: 'champion', id: champ.id }}
                />
                <AppText className="flex-1" numberOfLines={1}>
                  {displayName(champ)}
                </AppText>
                <StatValue
                  testID={`stat-wr-${champ.id}`}
                  label="Vitória"
                  value={r.win_rate}
                  source={r.source_url}
                  collectedAt={r.collected_at}
                />
                <StatValue
                  testID={`stat-pr-${champ.id}`}
                  label="Escolha"
                  value={r.pick_rate}
                  source={r.source_url}
                  collectedAt={r.collected_at}
                />
                <StatValue
                  testID={`stat-br-${champ.id}`}
                  label="Ban"
                  value={r.ban_rate}
                  source={r.source_url}
                  collectedAt={r.collected_at}
                />
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

function PatchChanges() {
  const { index } = useCatalog();
  if (!index) return null;
  return (
    <ScrollView contentContainerClassName="gap-3 pb-10">
      {index.bundle.patches.map((p) => (
        <Card key={p.version} className="gap-2">
          <AppText variant="heading">Patch {p.version}</AppText>
          {p.date ? (
            <AppText variant="caption">Lançado em {p.date.split('-').reverse().join('/')}</AppText>
          ) : null}
          {p.changes.length === 0 ? (
            <AppText variant="caption">Sem mudanças registradas.</AppText>
          ) : null}
          {p.changes.map((c) => {
            const champ =
              c.entity_kind === 'champion' ? index.champions.get(c.entity_id) : undefined;
            const item = c.entity_kind === 'item' ? index.items.get(c.entity_id) : undefined;
            const entity = champ ?? item;
            return (
              <View
                key={`${c.entity_kind}-${c.entity_id}`}
                testID={`change-${c.entity_id}`}
                className="min-h-touch flex-row items-center gap-3"
              >
                {entity ? (
                  <EntityIcon
                    icon={entity.icon}
                    name={displayName(entity)}
                    size={40}
                    details={
                      champ ? { kind: 'champion', id: champ.id } : { kind: 'item', id: item!.id }
                    }
                    onPress={() =>
                      router.push(champ ? `/champion/${champ.id}` : `/item/${item!.id}`)
                    }
                  />
                ) : null}
                <AppText className="flex-1">
                  {entity ? displayName(entity) : c.entity_id.replace(/_/g, ' ')}
                  {c.entity_kind === 'system' ? ' (sistema)' : ''}
                </AppText>
                <BuffNerfTag kind={c.change} />
              </View>
            );
          })}
          <AppText variant="caption">
            Efeito esperado no meta: disponível quando as dicas do patch forem geradas pela IA (uma
            vez por patch).
          </AppText>
          {p.notes_url ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(p.notes_url!)}
              className="min-h-touch justify-center"
            >
              <AppText className="text-info underline">Notas oficiais do patch</AppText>
            </Pressable>
          ) : null}
          <SourceBadge url={p.source_url} collectedAt={p.collected_at} />
        </Card>
      ))}
    </ScrollView>
  );
}
