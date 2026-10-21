import { displayName, type CatalogIndex, type Item } from '@riftbuild/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { BuffNerfTag } from '@/components/catalog/BuffNerfTag';
import { Chip } from '@/components/catalog/Chip';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { SourceBadge } from '@/components/catalog/SourceBadge';
import { AppText, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { CATEGORY_LABEL, formatStat } from '@/i18n/labels';

/** Recipe tree with icons, recursively (spec §5.1). */
function RecipeNode({
  item,
  index,
  depth = 0,
}: {
  item: Item;
  index: CatalogIndex;
  depth?: number;
}) {
  const children = item.recipe.map((id) => index.items.get(id)).filter((i): i is Item => !!i);
  return (
    <View testID={`recipe-${item.id}`} style={{ marginLeft: depth ? 20 : 0 }} className="gap-1">
      <View className="flex-row items-center gap-2">
        <EntityIcon
          icon={item.icon}
          name={displayName(item)}
          size={depth ? 36 : 44}
          details={{ kind: 'item', id: item.id }}
          onPress={depth ? () => router.push(`/item/${item.id}`) : undefined}
        />
        <AppText className={depth ? 'text-sm' : 'font-semibold'}>
          {displayName(item)}{' '}
          <AppText variant="caption">{item.cost !== null ? `· ${item.cost}` : ''}</AppText>
        </AppText>
      </View>
      {depth < 3 &&
        children.map((c) => <RecipeNode key={c.id} item={c} index={index} depth={depth + 1} />)}
    </View>
  );
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { index } = useCatalog();
  const item = id ? index?.items.get(id) : undefined;
  if (!index)
    return (
      <Screen>
        <DataBanners />
      </Screen>
    );
  if (!item) {
    return (
      <Screen>
        <AppText>Item não encontrado no catálogo do patch {index.patch}.</AppText>
      </Screen>
    );
  }
  const usedIn = [...index.items.values()].filter((i) => i.recipe.includes(item.id));
  const transformsFrom = item.transforms_from ? index.items.get(item.transforms_from) : undefined;

  return (
    <Screen testID="screen-item">
      <Stack.Screen options={{ title: displayName(item) }} />
      <DataBanners />
      <View className="flex-row items-center gap-4">
        <EntityIcon
          icon={item.icon}
          name={displayName(item)}
          size={72}
          details={{ kind: 'item', id: item.id }}
        />
        <View className="flex-1 gap-1">
          <AppText variant="title">{displayName(item)}</AppText>
          <AppText variant="caption">
            {item.cost !== null
              ? `${item.cost} de ouro`
              : 'Não comprável: obtido por transformação'}{' '}
            · {CATEGORY_LABEL[item.category]}
          </AppText>
          {item.last_change ? (
            <BuffNerfTag kind={item.last_change} patch={item.last_changed_patch} />
          ) : null}
        </View>
      </View>

      <Card className="gap-1">
        <AppText variant="heading">Atributos</AppText>
        {Object.keys(item.stats).length ? (
          Object.entries(item.stats).map(([k, v]) => (
            <AppText key={k}>{formatStat(k as never, v as number)}</AppText>
          ))
        ) : (
          <AppText variant="caption">Sem atributos fixos.</AppText>
        )}
      </Card>

      {item.passives.length + item.actives.length > 0 ? (
        <Card className="gap-2">
          <AppText variant="heading">Efeitos</AppText>
          {[...item.passives, ...item.actives].map((e, i) => (
            <View key={i} className="gap-1">
              <AppText className="font-semibold">
                {e.kind === 'active' ? 'Ativo' : e.unique ? 'Passiva única' : 'Passiva'}
                {e.name ? ` — ${e.name}` : ''}
                {e.cooldown ? ` (recarga ${e.cooldown} s)` : ''}
              </AppText>
              <AppText variant="caption">{e.description}</AppText>
            </View>
          ))}
          {item.unique_groups.length ? (
            <AppText variant="caption">
              Passivas únicas não acumulam com outro item que tenha a mesma passiva.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <Card className="gap-2">
        <AppText variant="heading">Receita</AppText>
        {item.recipe.length ? (
          <RecipeNode item={item} index={index} />
        ) : (
          <AppText variant="caption">Item básico, sem receita.</AppText>
        )}
        {transformsFrom ? (
          <AppText variant="caption">Transformação de {displayName(transformsFrom)}.</AppText>
        ) : null}
      </Card>

      {usedIn.length ? (
        <Card className="gap-2">
          <AppText variant="heading">Usado em</AppText>
          <View className="flex-row flex-wrap gap-2">
            {usedIn.map((i) => (
              <EntityIcon
                key={i.id}
                icon={i.icon}
                name={displayName(i)}
                size={44}
                details={{ kind: 'item', id: i.id }}
                onPress={() => router.push(`/item/${i.id}`)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {item.tags.map((tg) => (
          <Chip key={tg} label={tg.replace(/_/g, ' ')} tone="muted" />
        ))}
      </View>
      <SourceBadge url={item.source_url} collectedAt={item.collected_at} />
    </Screen>
  );
}
