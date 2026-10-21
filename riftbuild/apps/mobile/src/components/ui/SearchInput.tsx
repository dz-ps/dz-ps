import { TextInput, View } from 'react-native';
import { color } from '@/theme/tokens';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  testID?: string;
  autoFocus?: boolean;
};

export function SearchInput({ value, onChangeText, placeholder, testID, autoFocus }: Props) {
  return (
    <View className="min-h-touch flex-row items-center rounded-xl border border-control bg-surface2 px-3">
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType="search"
        style={{ flex: 1, color: color.text, fontSize: 16, minHeight: 48 }}
      />
    </View>
  );
}
