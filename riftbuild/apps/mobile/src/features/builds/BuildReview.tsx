import type { UserBuild } from '@riftbuild/shared';
import { AppText, Button, Card } from '@/components/ui';
import { env } from '@/lib/env';

/** "Analisar com IA" (spec §5.2). Wired to /ai/build-review in phase 5. */
export function BuildReview({ build }: { build: UserBuild }) {
  const ready = env.hasBackend && !!build.championId;
  return (
    <Card className="gap-2">
      <AppText variant="heading">Analisar com IA</AppText>
      <AppText variant="caption">
        {env.hasBackend
          ? 'Pontos fortes, fracos e trocas sugeridas, cada uma com motivo.'
          : 'A análise com IA precisa do backend configurado e de internet.'}
      </AppText>
      <Button label="Analisar com IA" disabled={!ready} onPress={() => {}} />
    </Card>
  );
}
