import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Pressable, View } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { t } from '@/i18n/pt-BR';
import { DATA_SOURCES } from '@/lib/sources';

function ExternalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${url}`}
      onPress={() => void Linking.openURL(url)}
      className="min-h-touch justify-center"
    >
      <AppText className="text-info underline">{label}</AppText>
    </Pressable>
  );
}

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  return (
    <Screen testID="screen-about">
      <Card className="gap-3">
        <AppText variant="heading">{t.about.legalTitle}</AppText>
        <AppText testID="legal-notice-en">{t.about.legalNoticeEn}</AppText>
        <AppText testID="legal-notice-pt">{t.about.legalNoticePt}</AppText>
        <AppText variant="caption">{t.about.noPayments}</AppText>
        <ExternalLink
          label="Política Legal Jibber Jabber da Riot"
          url="https://www.riotgames.com/en/legal"
        />
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">{t.about.sourcesTitle}</AppText>
        <AppText variant="caption">{t.about.sourcesIntro}</AppText>
        {DATA_SOURCES.map((source) => (
          <View
            key={source.id}
            testID={`source-${source.id}`}
            className="gap-1 border-t border-border pt-3"
          >
            <AppText className="font-semibold">{source.name}</AppText>
            <AppText variant="caption">{source.usedFor}</AppText>
            <AppText variant="caption">{source.license}</AppText>
            <ExternalLink label={source.url.replace(/^https:\/\//, '')} url={source.url} />
            {source.licenseUrl ? (
              <ExternalLink label="Licença / termos" url={source.licenseUrl} />
            ) : null}
          </View>
        ))}
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">{t.about.privacyTitle}</AppText>
        <AppText>{t.about.privacyBody}</AppText>
        <AppText variant="caption">{t.about.deleteData}</AppText>
      </Card>

      <AppText variant="caption">
        {t.about.version} {version}
      </AppText>
    </Screen>
  );
}
