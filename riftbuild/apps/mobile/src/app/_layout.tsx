import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '@/data/AppProviders';
import { t } from '@/i18n/pt-BR';
import { color } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <AppProviders>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: color.surface },
              headerTintColor: color.text,
              headerTitleStyle: { color: color.text },
              contentStyle: { backgroundColor: color.bg },
              headerBackTitle: t.nav.back,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="about" options={{ title: t.about.title }} />
            <Stack.Screen name="profile" options={{ title: t.nav.profile }} />
            <Stack.Screen name="champion/[id]" options={{ title: 'Campeão' }} />
            <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
            <Stack.Screen name="build/[id]" options={{ title: 'Build' }} />
            <Stack.Screen name="b/[code]" options={{ title: 'Build compartilhada' }} />
            <Stack.Screen name="bans" options={{ title: 'Bans sugeridos' }} />
          </Stack>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
