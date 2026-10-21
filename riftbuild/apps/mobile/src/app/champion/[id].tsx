import { bestStat, displayName } from '@riftbuild/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BuffNerfTag } from '@/components/catalog/BuffNerfTag';
import { Chip } from '@/components/catalog/Chip';
import { DamageBar } from '@/components/catalog/DamageBar';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { SourceBadge } from '@/components/catalog/SourceBadge';
import { AppText, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { StatValue } from '@/features/meta/StatValue';
import { ABILITY_KEY_LABEL, CC_LABEL, CLASS_LABEL, ROLE_LABEL, TAG_LABEL } from '@/i18n/labels';

const BASE_STAT_ROWS: [string, string, string?][] = [
  ['hp', 'Vida', 'hp_per_level'],
  ['mana', 'Mana', 'mana_per_level'],
  ['ad', 'Dano de Ataque', 'ad_per_level'],
  ['attack_speed', 'Velocidade de Ataque', 'attack_speed_per_level'],
  ['armor', 'Armadura', 'armor_per_level'],
  ['mr', 'Resistência Mágica', 'mr_per_level'],
  ['move_speed', 'Velocidade de Movimento'],
  ['attack_range', 'Alcance'],
];

export default function ChampionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { index, meta } = useCatalog();
  const champ = id ? index?.champions.get(id) : undefined;
  if (!index)
    return (
      <Screen>
        <DataBanners />
      </Screen>
    );
  if (!champ) {
    return (
      <Screen>
        <AppText>Campeão não encontrado no catálogo do patch {index.patch}.</AppText>
      </Screen>
    );
  }
  const changes = index.bundle.patches.flatMap((p) =>
    p.changes
      .filter((c) => c.entity_kind === 'champion' && c.entity_id === champ.id)
      .map((c) => ({ ...c, patch: p.version })),
  );
  const builds = meta?.builds.filter((b) => b.champion_id === champ.id) ?? [];
  const stat = bestStat(champ.id, champ.roles, meta);

  return (
    <Screen testID="screen-champion">
      <Stack.Screen options={{ title: displayName(champ) }} />
      <DataBanners />
      <View className="flex-row items-center gap-4">
        <EntityIcon
          icon={champ.icon}
          name={displayName(champ)}
          size={80}
          details={{ kind: 'champion', id: champ.id }}
        />
        <View className="flex-1 gap-1">
          <AppText variant="title">{displayName(champ)}</AppText>
          {champ.name_pt && champ.name_pt !== champ.name_en ? (
            <AppText variant="caption">{champ.name_en}</AppText>
          ) : null}
          {champ.title_pt || champ.title_en ? (
            <AppText variant="caption">{champ.title_pt ?? champ.title_en}</AppText>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {champ.roles.map((r) => (
              <Chip key={r} label={ROLE_LABEL[r]} tone="accent" />
            ))}
            {champ.classes.map((c) => (
              <Chip key={c} label={CLASS_LABEL[c] ?? c} />
            ))}
          </View>
        </View>
      </View>
      {changes.map((c) => (
        <BuffNerfTag key={`${c.patch}-${c.change}`} kind={c.change} patch={c.patch} />
      ))}

      {stat ? (
        <Card className="gap-2">
          <AppText variant="heading">
            No patch ({stat.rank_tier}, {ROLE_LABEL[stat.role]})
          </AppText>
          <View className="flex-row gap-4">
            <StatValue
              label="Vitória"
              value={stat.win_rate}
              source={stat.source_url}
              collectedAt={stat.collected_at}
              testID="stat-win"
            />
            <StatValue
              label="Escolha"
              value={stat.pick_rate}
              source={stat.source_url}
              collectedAt={stat.collected_at}
              testID="stat-pick"
            />
            <StatValue
              label="Banimento"
              value={stat.ban_rate}
              source={stat.source_url}
              collectedAt={stat.collected_at}
              testID="stat-ban"
            />
          </View>
          <SourceBadge url={stat.source_url} collectedAt={stat.collected_at} />
        </Card>
      ) : null}

      <Card className="gap-3">
        <AppText variant="heading">Habilidades</AppText>
        {champ.abilities.map((a) => (
          <View key={a.key} testID={`ability-${a.key}`} className="flex-row gap-3">
            <EntityIcon
              icon={a.icon}
              name={displayName(a)}
              size={48}
              details={{ kind: 'ability', championId: champ.id, key: a.key }}
            />
            <View className="flex-1 gap-1">
              <AppText className="font-semibold">
                {displayName(a)}{' '}
                <AppText variant="caption">
                  · {ABILITY_KEY_LABEL[a.key]} ({a.key}){a.cooldown ? ` · ${a.cooldown} s` : ''}
                </AppText>
              </AppText>
              <AppText variant="caption">{a.description_pt ?? a.description_en}</AppText>
              {a.cc_types.length ? (
                <AppText variant="caption" className="text-info">
                  Controle: {a.cc_types.map((c) => CC_LABEL[c]).join(', ')} (estimado)
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Perfil</AppText>
        {champ.damage_profile ? (
          <DamageBar damage={champ.damage_profile} />
        ) : (
          <AppText variant="caption">Perfil de dano indisponível.</AppText>
        )}
        <View className="flex-row flex-wrap gap-2">
          {champ.tags.map((tg) => (
            <Chip
              key={tg.tag}
              label={`${TAG_LABEL[tg.tag]}${tg.source === 'derived' ? ' · estimado' : ''}`}
            />
          ))}
        </View>
        <AppText variant="caption">
          Tags estimadas a partir do texto oficial das habilidades; toque longo nas habilidades para
          ver o texto.
        </AppText>
      </Card>

      <Card className="gap-2">
        <AppText variant="heading">Builds mais usadas</AppText>
        {builds.length ? (
          builds.map((b) => (
            <View key={`${b.role}-${b.core_items.join()}`} className="gap-2">
              <AppText variant="caption">{ROLE_LABEL[b.role]}</AppText>
              <View className="flex-row gap-2">
                {b.core_items.map((itemId) => {
                  const item = index.items.get(itemId);
                  return item ? (
                    <EntityIcon
                      key={itemId}
                      icon={item.icon}
                      name={displayName(item)}
                      size={44}
                      details={{ kind: 'item', id: itemId }}
                      onPress={() => router.push(`/item/${itemId}`)}
                    />
                  ) : null;
                })}
              </View>
              {b.win_rate !== null ? (
                <View className="flex-row gap-4">
                  <StatValue
                    label="Vitória"
                    value={b.win_rate}
                    source={b.source_url}
                    collectedAt={b.collected_at}
                    testID="stat-build-win"
                  />
                  {b.pick_rate !== null ? (
                    <StatValue
                      label="Escolha"
                      value={b.pick_rate}
                      source={b.source_url}
                      collectedAt={b.collected_at}
                      testID="stat-build-pick"
                    />
                  ) : null}
                </View>
              ) : null}
              <SourceBadge url={b.source_url} collectedAt={b.collected_at} />
            </View>
          ))
        ) : (
          <AppText variant="caption">Sem build de meta registrada para este campeão.</AppText>
        )}
      </Card>

      <Card className="gap-2">
        <AppText variant="heading">Counters</AppText>
        <AppText variant="caption">
          Ainda não há dados de confronto com fonte confiável. O assistente de draft sugere counters
          a partir do meta e da composição.
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/draft')}
          className="min-h-touch justify-center"
        >
          <AppText className="text-info underline">Abrir assistente de draft</AppText>
        </Pressable>
      </Card>

      {champ.base_stats ? (
        <Card className="gap-1">
          <AppText variant="heading">Atributos base (nível 1)</AppText>
          {BASE_STAT_ROWS.map(([key, label, growthKey]) => {
            const v = (champ.base_stats as Record<string, number | null>)[key];
            if (v === null || v === undefined) return null;
            const g = growthKey
              ? (champ.base_stats as Record<string, number | null>)[growthKey]
              : null;
            return (
              <AppText key={key} variant="caption">
                {label}: <AppText className="text-text">{v}</AppText>
                {g ? ` (+${g}${key === 'attack_speed' ? '%' : ''} por nível)` : ''}
              </AppText>
            );
          })}
        </Card>
      ) : null}

      <SourceBadge url={champ.source_url} collectedAt={champ.collected_at} />
      {champ.extra_sources.map((u) => (
        <SourceBadge key={u} url={u} collectedAt={champ.collected_at} />
      ))}
    </Screen>
  );
}
