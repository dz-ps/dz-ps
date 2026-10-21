import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { HeaderActions } from '@/components/HeaderActions';
import { t } from '@/i18n/pt-BR';
import { color } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color: tint, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={tint as string} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.surface },
        headerTintColor: color.text,
        headerRight: () => <HeaderActions />,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border, height: 64 },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t.tabs.home, tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="draft"
        options={{ title: t.tabs.draft, tabBarIcon: tabIcon('flash-outline') }}
      />
      <Tabs.Screen
        name="builds"
        options={{ title: t.tabs.builds, tabBarIcon: tabIcon('construct-outline') }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: t.tabs.catalog, tabBarIcon: tabIcon('grid-outline') }}
      />
      <Tabs.Screen
        name="meta"
        options={{ title: t.tabs.meta, tabBarIcon: tabIcon('stats-chart-outline') }}
      />
    </Tabs>
  );
}
