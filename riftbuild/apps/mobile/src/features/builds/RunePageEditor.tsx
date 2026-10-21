import {
  displayName,
  RUNE_PATHS,
  validateRunePage,
  type RunePage,
  type RunePath,
} from '@riftbuild/shared';
import { View } from 'react-native';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText, Segmented } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { PATH_LABEL } from '@/i18n/labels';

type Props = { value: RunePage; onChange: (page: RunePage) => void };

/** Rune page builder; shows the rule violations from the shared validator (rules come from the bundle). */
export function RunePageEditor({ value, onChange }: Props) {
  const { index } = useCatalog();
  if (!index) return null;
  const runes = [...index.runes.values()];
  const rule = index.rules.rune_page;
  const keystones = runes.filter(
    (r) =>
      r.kind === 'keystone' &&
      (!rule.keystone_tied_to_primary_path || r.path === value.primaryPath),
  );
  const path = value.primaryPath as RunePath | null;
  const { errors } = validateRunePage(value, index);

  const setPrimaryPath = (next: RunePath) =>
    onChange({
      ...value,
      primaryPath: next,
      primary: rule.primary_slots.map(() => null),
      secondary:
        value.secondary && index.runes.get(value.secondary)?.path === next ? null : value.secondary,
    });

  return (
    <View testID="rune-editor" className="gap-3">
      <AppText variant="label">Runa-chave</AppText>
      <View className="flex-row flex-wrap gap-1">
        {keystones.map((r) => (
          <EntityIcon
            key={r.id}
            testID={`keystone-${r.id}`}
            icon={r.icon}
            name={displayName(r)}
            size={44}
            rounded
            selected={value.keystone === r.id}
            dimmed={!!value.keystone && value.keystone !== r.id}
            onPress={() => onChange({ ...value, keystone: r.id })}
            details={{ kind: 'rune', id: r.id }}
          />
        ))}
      </View>

      <AppText variant="label">Árvore primária</AppText>
      <Segmented
        testID="primary-path"
        options={RUNE_PATHS.map((p) => ({ value: p, label: PATH_LABEL[p] }))}
        value={(path ?? '') as RunePath}
        onChange={setPrimaryPath}
      />
      {path
        ? rule.primary_slots.map((slot, i) => (
            <View key={slot} className="flex-row items-center gap-1">
              <AppText variant="caption" className="w-14">
                Slot {slot}
              </AppText>
              {runes
                .filter((r) => r.kind === 'minor' && r.path === path && r.slot === slot)
                .map((r) => (
                  <EntityIcon
                    key={r.id}
                    testID={`primary-${r.id}`}
                    icon={r.icon}
                    name={displayName(r)}
                    size={40}
                    rounded
                    selected={value.primary[i] === r.id}
                    dimmed={!!value.primary[i] && value.primary[i] !== r.id}
                    onPress={() => {
                      const primary = value.primary.slice();
                      primary[i] = r.id;
                      onChange({ ...value, primary });
                    }}
                    details={{ kind: 'rune', id: r.id }}
                  />
                ))}
            </View>
          ))
        : null}

      <AppText variant="label">Runa secundária (outra árvore)</AppText>
      <View className="flex-row flex-wrap gap-1">
        {runes
          .filter(
            (r) =>
              r.kind === 'minor' && (!rule.secondary_must_differ_from_primary || r.path !== path),
          )
          .map((r) => (
            <EntityIcon
              key={r.id}
              testID={`secondary-${r.id}`}
              icon={r.icon}
              name={displayName(r)}
              size={40}
              rounded
              selected={value.secondary === r.id}
              dimmed={!!value.secondary && value.secondary !== r.id}
              onPress={() => onChange({ ...value, secondary: r.id })}
              details={{ kind: 'rune', id: r.id }}
            />
          ))}
      </View>
      {errors.length ? (
        <AppText testID="rune-errors" variant="caption" className="text-warning">
          ⚠ {errors[0]!.message_pt}
        </AppText>
      ) : (
        <AppText testID="rune-ok" variant="caption" className="text-buff">
          ✓ Página de runas válida
        </AppText>
      )}
    </View>
  );
}
