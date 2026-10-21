import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { formatDate } from '@/i18n/labels';

type Props = {
  label: string;
  value: number;
  /** Required: no meta number is ever shown without its source and collection date (spec §5.3, phase 4). */
  source: string;
  collectedAt: string;
  suffix?: string;
  testID: string;
};

/** The only component allowed to render a meta statistic. */
export function StatValue({ label, value, source, collectedAt, suffix = '%', testID }: Props) {
  const text = `${value.toFixed(1).replace('.', ',')}${suffix}`;
  return (
    <View
      testID={testID}
      accessibilityLabel={`${label}: ${text}. Fonte ${source.replace(/^https:\/\//, '').split('/')[0]}, coletado em ${formatDate(collectedAt)}`}
    >
      <AppText variant="caption">{label}</AppText>
      <AppText className="text-lg font-bold">{text}</AppText>
    </View>
  );
}
