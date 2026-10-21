import { computeTotals, type StatTotals } from '@riftbuild/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';

const ROWS: [keyof StatTotals, string, string?][] = [
  ['ad', 'Dano de Ataque'],
  ['ap', 'Poder de Habilidade'],
  ['hp', 'Vida'],
  ['armor', 'Armadura'],
  ['mr', 'Resistência Mágica'],
  ['attack_speed', 'Vel. de Ataque'],
  ['ability_haste', 'Aceleração'],
  ['armor_pen', 'Pen. de Armadura'],
  ['armor_pen_pct', 'Pen. de Armadura', '%'],
  ['magic_pen', 'Pen. Mágica'],
  ['magic_pen_pct', 'Pen. Mágica', '%'],
  ['crit', 'Crítico', '%'],
  ['move_speed', 'Vel. de Movimento'],
  ['tenacity', 'Tenacidade', '%'],
];

/** Totals at a chosen level (spec §5.2), from catalog numbers only. */
export function StatPanel({ championId, items }: { championId: string | null; items: string[] }) {
  const { index } = useCatalog();
  const [level, setLevel] = useState(1);
  if (!index) return null;
  const result = computeTotals(championId, level, items, index);
  const max = index.rules.max_level;
  return (
    <View testID="stat-panel" className="gap-2">
      <View className="flex-row items-center gap-2">
        <Button
          label="−"
          kind="secondary"
          accessibilityLabel="Diminuir nível"
          onPress={() => setLevel((l) => Math.max(1, l - 1))}
        />
        <AppText testID="stat-level" className="flex-1 text-center text-lg font-bold">
          Nível {result.level}
        </AppText>
        <Button
          label="+"
          kind="secondary"
          accessibilityLabel="Aumentar nível"
          onPress={() => setLevel((l) => Math.min(max, l + 1))}
        />
      </View>
      <View className="flex-row flex-wrap">
        {ROWS.map(([key, label, suffix]) =>
          result.totals[key] ? (
            <View key={key} className="w-1/2 py-1">
              <AppText variant="caption">{label}</AppText>
              <AppText className="font-semibold">
                {String(result.totals[key]).replace('.', ',')}
                {suffix ?? ''}
              </AppText>
            </View>
          ) : null,
        )}
      </View>
      {result.missingBaseStats && championId ? (
        <AppText variant="caption">
          Sem atributos base deste campeão na fonte: só os itens estão somados.
        </AppText>
      ) : null}
      {result.estimated ? (
        <AppText variant="caption">
          Crescimento por nível estimado (linear): a fórmula do Wild Rift não está confirmada.
        </AppText>
      ) : null}
      {index.rules.flags.max_level && !index.rules.flags.max_level.confirmed ? (
        <AppText variant="caption">Nível máximo {max} a confirmar.</AppText>
      ) : null}
    </View>
  );
}
