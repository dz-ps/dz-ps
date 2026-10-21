import { displayName, type Item, type Rune } from '@riftbuild/shared';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText, SearchInput, Segmented } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { useEntitySearch } from '@/features/catalog/useEntitySearch';
import { CATEGORY_LABEL, PATH_LABEL } from '@/i18n/labels';
import { prefs } from '@/lib/storage';

type Tab = 'champions' | 'items' | 'runes' | 'spells';
const TABS: { value: Tab; label: string }[] = [
  { value: 'champions', label: 'Campeões' },
  { value: 'items', label: 'Itens' },
  { value: 'runes', label: 'Runas' },
  { value: 'spells', label: 'Feitiços' },
];
const CATEGORY_ORDER: Item['category'][] = [
  'physical',
  'magic',
  'defense',
  'support',
  'boots',
  'component',
];

type Row<T> =
  { type: 'header'; key: string; title: string } | { type: 'row'; key: string; entity: T };

export default function CatalogScreen() {
  const { index } = useCatalog();
  const [tab, setTabState] = useState<Tab>(
    () => (prefs.getString('catalog.tab') as Tab) || 'champions',
  );
  const [query, setQuery] = useState('');
  const setTab = (next: Tab) => {
    setTabState(next);
    setQuery('');
    prefs.setString('catalog.tab', next);
  };

  return (
    <View testID="screen-catalog" className="flex-1 gap-3 bg-bg px-4 pt-3">
      <DataBanners />
      <Segmented options={TABS} value={tab} onChange={setTab} testID="catalog-tabs" />
      <SearchInput
        testID="catalog-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar em português ou inglês (ex.: mumu, kaisa)"
      />
      {index ? (
        <View className="flex-1">
          {tab === 'champions' && <ChampionGrid query={query} />}
          {tab === 'items' && <ItemList query={query} />}
          {tab === 'runes' && <RuneList query={query} />}
          {tab === 'spells' && <SpellList query={query} />}
        </View>
      ) : null}
    </View>
  );
}

function ChampionGrid({ query }: { query: string }) {
  const { index, championSearch } = useCatalog();
  const champions = useMemo(() => [...(index?.champions.values() ?? [])], [index]);
  const results = useEntitySearch(champions, query, championSearch);
  return (
    <FlashList
      testID="champion-grid"
      data={results}
      numColumns={4}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<AppText variant="caption">Nenhum campeão encontrado.</AppText>}
      renderItem={({ item: c }) => (
        <View className="mb-3 flex-1 items-center">
          <EntityIcon
            testID={`champion-${c.id}`}
            icon={c.icon}
            name={displayName(c)}
            size={64}
            details={{ kind: 'champion', id: c.id }}
            onPress={() => router.push(`/champion/${c.id}`)}
          />
          <AppText numberOfLines={1} className="mt-1 text-center text-xs">
            {displayName(c)}
          </AppText>
        </View>
      )}
    />
  );
}

function ItemList({ query }: { query: string }) {
  const { index } = useCatalog();
  const items = useMemo(() => [...(index?.items.values() ?? [])], [index]);
  const results = useEntitySearch(items, query);
  const rows = useMemo<Row<Item>[]>(() => {
    if (query.trim()) return results.map((i) => ({ type: 'row', key: i.id, entity: i }));
    return CATEGORY_ORDER.flatMap((cat) => {
      const inCat = results.filter((i) => i.category === cat);
      return inCat.length
        ? [
            { type: 'header' as const, key: `h-${cat}`, title: CATEGORY_LABEL[cat] },
            ...inCat.map((i) => ({ type: 'row' as const, key: i.id, entity: i })),
          ]
        : [];
    });
  }, [results, query]);
  return (
    <FlashList
      testID="item-list"
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.type}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item: r }) =>
        r.type === 'header' ? (
          <AppText variant="label" className="mb-1 mt-3">
            {r.title}
          </AppText>
        ) : (
          <Pressable
            testID={`item-row-${r.entity.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${displayName(r.entity)}, ${r.entity.cost ?? 'sem custo'} de ouro`}
            onPress={() => router.push(`/item/${r.entity.id}`)}
            className="min-h-touch flex-row items-center gap-3 border-b border-border py-1"
          >
            <EntityIcon
              icon={r.entity.icon}
              name={displayName(r.entity)}
              size={40}
              details={{ kind: 'item', id: r.entity.id }}
            />
            <View className="flex-1">
              <AppText>{displayName(r.entity)}</AppText>
              <AppText variant="caption">
                {r.entity.cost !== null ? `${r.entity.cost} de ouro` : 'Transformação'} ·{' '}
                {CATEGORY_LABEL[r.entity.category]}
              </AppText>
            </View>
          </Pressable>
        )
      }
    />
  );
}

function RuneList({ query }: { query: string }) {
  const { index } = useCatalog();
  const runes = useMemo(() => [...(index?.runes.values() ?? [])], [index]);
  const results = useEntitySearch(runes, query);
  const rows = useMemo<Row<Rune>[]>(() => {
    if (query.trim()) return results.map((r) => ({ type: 'row', key: r.id, entity: r }));
    const out: Row<Rune>[] = [];
    const keystones = runes.filter((r) => r.kind === 'keystone');
    out.push(
      { type: 'header', key: 'h-key', title: 'Runas-chave' },
      ...keystones.map((r) => ({ type: 'row' as const, key: r.id, entity: r })),
    );
    for (const path of ['domination', 'precision', 'resolve', 'sorcery'] as const) {
      for (const slot of [1, 2, 3]) {
        const inSlot = runes.filter((r) => r.path === path && r.slot === slot);
        if (!inSlot.length) continue;
        out.push({
          type: 'header',
          key: `h-${path}-${slot}`,
          title: `${PATH_LABEL[path]} · slot ${slot}`,
        });
        out.push(...inSlot.map((r) => ({ type: 'row' as const, key: r.id, entity: r })));
      }
    }
    return out;
  }, [runes, results, query]);
  return <EntityRows rows={rows} kind="rune" testID="rune-list" />;
}

function SpellList({ query }: { query: string }) {
  const { index } = useCatalog();
  const spells = useMemo(() => [...(index?.spells.values() ?? [])], [index]);
  const results = useEntitySearch(spells, query);
  return (
    <EntityRows
      rows={results.map((s) => ({ type: 'row', key: s.id, entity: s }))}
      kind="spell"
      testID="spell-list"
    />
  );
}

function EntityRows<
  T extends {
    id: string;
    icon: string | null;
    name_en: string;
    name_pt: string | null;
    description: string;
  },
>({ rows, kind, testID }: { rows: Row<T>[]; kind: 'rune' | 'spell'; testID: string }) {
  return (
    <FlashList
      testID={testID}
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.type}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item: r }) =>
        r.type === 'header' ? (
          <AppText variant="label" className="mb-1 mt-3">
            {r.title}
          </AppText>
        ) : (
          <View className="min-h-touch flex-row items-center gap-3 border-b border-border py-2">
            <EntityIcon
              icon={r.entity.icon}
              name={displayName(r.entity)}
              size={40}
              rounded={kind === 'rune'}
              details={{ kind, id: r.entity.id }}
            />
            <View className="flex-1">
              <AppText>{displayName(r.entity)}</AppText>
              <AppText variant="caption" numberOfLines={2}>
                {r.entity.description}
              </AppText>
            </View>
          </View>
        )
      }
    />
  );
}
