import * as Linking from 'expo-linking';
import { Pressable } from 'react-native';
import { AppText } from '@/components/ui';
import { formatDate } from '@/i18n/labels';

function sourceName(url: string): string {
  if (url.includes('wildrift.leagueoflegends.com')) return 'Site oficial do Wild Rift';
  if (url.includes('riftpatchnotes.com')) return 'Rift Patch Notes';
  if (url.includes('wiki.leagueoflegends.com')) return 'LoL Wiki (CC BY-SA 3.0)';
  return url.replace(/^https:\/\//, '').split('/')[0] ?? url;
}

/** Every number and entity shows where it came from and when it was collected (spec §2, §5.3). */
export function SourceBadge({
  url,
  collectedAt,
  testID,
}: {
  url: string;
  collectedAt: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`Fonte: ${sourceName(url)}, coletado em ${formatDate(collectedAt)}`}
      onPress={() => void Linking.openURL(url)}
      className="min-h-touch justify-center"
    >
      <AppText variant="caption" className="text-muted underline">
        Fonte: {sourceName(url)} · coletado em {formatDate(collectedAt)}
      </AppText>
    </Pressable>
  );
}
