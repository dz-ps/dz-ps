import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { t } from '@/i18n/pt-BR';
import { color } from '@/theme/tokens';

export function HeaderActions() {
  return (
    <View className="flex-row">
      <Link href="/profile" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.nav.profile}
          className="min-h-touch min-w-touch items-center justify-center"
        >
          <Ionicons name="person-circle-outline" size={26} color={color.text} />
        </Pressable>
      </Link>
      <Link href="/about" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.nav.about}
          className="min-h-touch min-w-touch items-center justify-center"
        >
          <Ionicons name="information-circle-outline" size={26} color={color.text} />
        </Pressable>
      </Link>
    </View>
  );
}
