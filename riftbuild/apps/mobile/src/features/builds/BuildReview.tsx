import { displayName, type AiBuildReview, type UserBuild } from '@riftbuild/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText, Banner, Button, Card } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { requestBuildReview } from '@/data/remote/review';
import { loadProfile } from '@/features/profile/profile';
import { env } from '@/lib/env';

/** "Analisar com IA" (spec §5.2): strengths, weaknesses and swaps, each with a reason. */
export function BuildReview({ build }: { build: UserBuild }) {
  const { index } = useCatalog();
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<AiBuildReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = env.hasBackend && !!build.championId && build.items.some(Boolean);

  async function run() {
    if (!index) return;
    setLoading(true);
    setError(null);
    const result = await requestBuildReview(build, index, loadProfile().style);
    setLoading(false);
    if (result.ok) setReview(result.review);
    else setError(result.message);
  }

  return (
    <Card className="gap-2" testID="build-review">
      <AppText variant="heading">Analisar com IA</AppText>
      <AppText variant="caption">
        {env.hasBackend
          ? 'Pontos fortes, fracos e trocas sugeridas, cada uma com motivo.'
          : 'A análise com IA precisa do backend configurado e de internet.'}
      </AppText>
      <Button
        label={loading ? 'Analisando…' : 'Analisar com IA'}
        disabled={!ready || loading}
        onPress={() => void run()}
      />
      {error ? <Banner tone="danger" text={error} /> : null}
      {review && index ? (
        <View className="gap-2">
          {review.strengths.map((s, i) => (
            <AppText key={`s${i}`}>✓ {s}</AppText>
          ))}
          {review.weaknesses.map((w, i) => (
            <AppText key={`w${i}`}>⚠ {w}</AppText>
          ))}
          {review.swaps.map((sw) => {
            const from = index.items.get(sw.remove)!;
            const to = index.items.get(sw.add)!;
            return (
              <View key={`${sw.remove}-${sw.add}`} className="flex-row items-center gap-2">
                <EntityIcon
                  icon={from.icon}
                  name={displayName(from)}
                  size={36}
                  details={{ kind: 'item', id: from.id }}
                />
                <AppText>→</AppText>
                <EntityIcon
                  icon={to.icon}
                  name={displayName(to)}
                  size={36}
                  details={{ kind: 'item', id: to.id }}
                />
                <AppText variant="caption" className="flex-1">
                  {sw.reason}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
