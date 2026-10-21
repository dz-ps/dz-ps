import { View } from 'react-native';
import { AppText } from './AppText';

type Tone = 'info' | 'warning' | 'danger';

const toneClass: Record<Tone, string> = {
  info: 'border-info',
  warning: 'border-warning',
  danger: 'border-danger',
};

const toneIcon: Record<Tone, string> = { info: 'ℹ', warning: '⚠', danger: '⛔' };

export function Banner({
  tone = 'info',
  text,
  testID,
}: {
  tone?: Tone;
  text: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      className={`flex-row items-start gap-2 rounded-xl border bg-surface2 p-3 ${toneClass[tone]}`}
    >
      <AppText importantForAccessibility="no" accessibilityElementsHidden>
        {toneIcon[tone]}
      </AppText>
      <AppText className="flex-1 text-sm">{text}</AppText>
    </View>
  );
}
