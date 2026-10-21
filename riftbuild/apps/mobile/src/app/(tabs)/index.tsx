import { router } from 'expo-router';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { t } from '@/i18n/pt-BR';
import { env } from '@/lib/env';

export default function HomeScreen() {
  return (
    <Screen testID="screen-home">
      {!env.hasBackend && <Banner tone="warning" text={t.common.noBackend} />}
      <Card className="gap-3">
        <AppText variant="heading">{t.home.analyzeDraft}</AppText>
        <AppText variant="caption">{t.home.analyzeDraftHint}</AppText>
        <Button label={t.home.analyzeDraft} size="lg" onPress={() => router.push('/draft')} />
      </Card>
    </Screen>
  );
}
