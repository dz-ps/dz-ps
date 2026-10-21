import { Pressable } from 'react-native';
import { AppText } from './AppText';

/** Selectable pill (role, elo, style filters) with the 48 dp touch minimum. */
export function ToggleChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-touch justify-center rounded-full border px-4 ${selected ? 'border-accent' : 'border-control'}`}
    >
      <AppText className={selected ? 'text-accent' : 'text-text'}>{label}</AppText>
    </Pressable>
  );
}
