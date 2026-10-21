import { displayName } from '@riftbuild/shared';
import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { AppText, Button, SearchInput } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { useEntitySearch } from '@/features/catalog/useEntitySearch';
import { t } from '@/i18n/pt-BR';
import type { DetailsTarget } from './DetailsSheet';
import { EntityIcon } from './EntityIcon';

type Entity = { id: string; name_en: string; name_pt: string | null; icon: string | null };

type Props<T extends Entity> = {
  visible: boolean;
  title: string;
  entities: T[];
  onPick: (entity: T) => void;
  onClose: () => void;
  detailsKind?: 'champion' | 'item' | 'spell' | 'rune';
  subtitle?: (entity: T) => string | null;
  testID?: string;
};

/** Search + icon grid used to pick champions, items and spells. */
export function EntityPicker<T extends Entity>({
  visible,
  title,
  entities,
  onPick,
  onClose,
  detailsKind,
  subtitle,
  testID,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const { championSearch } = useCatalog();
  // Champions get the alias-aware index ("ww", "mumu", "voli"), same as the catalog and draft parser.
  const results = useEntitySearch(
    entities,
    query,
    detailsKind === 'champion' ? championSearch : null,
  );
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View testID={testID} className="flex-1 gap-3 bg-bg px-4 pt-10">
        <AppText variant="heading">{title}</AppText>
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar…"
          testID={testID ? `${testID}-search` : undefined}
        />
        <View className="flex-1">
          <FlashList
            data={results}
            numColumns={4}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: e }) => (
              <View className="mb-3 flex-1 items-center">
                <EntityIcon
                  testID={testID ? `${testID}-${e.id}` : undefined}
                  icon={e.icon}
                  name={displayName(e)}
                  size={56}
                  onPress={() => {
                    onPick(e);
                    setQuery('');
                  }}
                  details={
                    detailsKind ? ({ kind: detailsKind, id: e.id } as DetailsTarget) : undefined
                  }
                />
                <AppText numberOfLines={1} className="mt-1 text-center text-xs">
                  {displayName(e)}
                </AppText>
                {subtitle?.(e) ? (
                  <AppText numberOfLines={1} variant="caption" className="text-[10px]">
                    {subtitle(e)}
                  </AppText>
                ) : null}
              </View>
            )}
          />
        </View>
        <Button label={t.common.close} kind="secondary" onPress={onClose} className="mb-6" />
      </View>
    </Modal>
  );
}
