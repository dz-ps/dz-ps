import { View } from 'react-native';
import { AppText } from '@/components/ui';

export function Chip({
  label,
  tone = 'default',
  testID,
}: {
  label: string;
  tone?: 'default' | 'accent' | 'muted';
  testID?: string;
}) {
  const cls = tone === 'accent' ? 'border-accent' : 'border-border';
  const text = tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-muted' : 'text-text';
  return (
    <View testID={testID} className={`rounded-full border px-3 py-1 ${cls}`}>
      <AppText className={`text-xs font-semibold ${text}`}>{label}</AppText>
    </View>
  );
}
