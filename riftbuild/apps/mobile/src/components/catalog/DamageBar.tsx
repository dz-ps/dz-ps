import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { color } from '@/theme/tokens';

type Damage = { physical: number; magic: number; true: number };

/** Physical / magic / true split, with numbers in text (not color alone). */
export function DamageBar({
  damage,
  estimated = true,
  testID,
}: {
  damage: Damage;
  estimated?: boolean;
  testID?: string;
}) {
  const pct = (n: number) => Math.round(n * 100);
  return (
    <View
      testID={testID}
      className="gap-1"
      accessibilityLabel={`Dano: ${pct(damage.physical)}% físico, ${pct(damage.magic)}% mágico, ${pct(damage.true)}% verdadeiro`}
    >
      <View className="h-3 flex-row overflow-hidden rounded-full bg-surface2">
        <View style={{ flex: damage.physical, backgroundColor: color.physical }} />
        <View style={{ flex: damage.magic, backgroundColor: color.magic }} />
        <View style={{ flex: damage.true, backgroundColor: color.true }} />
      </View>
      <AppText variant="caption">
        Físico {pct(damage.physical)}% · Mágico {pct(damage.magic)}% · Verdadeiro {pct(damage.true)}
        %{estimated ? ' (estimado)' : ''}
      </AppText>
    </View>
  );
}
