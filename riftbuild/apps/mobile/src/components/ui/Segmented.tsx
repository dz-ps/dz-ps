import { Pressable, View } from 'react-native';
import { AppText } from './AppText';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
};

export function Segmented<T extends string>({ options, value, onChange, testID }: Props<T>) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      className="flex-row rounded-xl border border-border bg-surface p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            className={`min-h-touch flex-1 items-center justify-center rounded-lg ${active ? 'bg-surface2' : ''}`}
          >
            <AppText className={`text-sm font-semibold ${active ? 'text-accent' : 'text-muted'}`}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
