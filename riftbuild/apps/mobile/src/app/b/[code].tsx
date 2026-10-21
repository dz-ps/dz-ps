import { decodeBuild } from '@riftbuild/shared';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { setPendingBuild } from '@/features/builds/handoff';

/** Deep link riftbuild://b/<code>: opens a shared build in the editor. */
export default function SharedBuildRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const decoded = code ? decodeBuild(code) : null;
  if (!decoded) {
    return (
      <Screen>
        <AppText>Link de build inválido.</AppText>
      </Screen>
    );
  }
  setPendingBuild(decoded.build);
  return <Redirect href="/build/new" />;
}
