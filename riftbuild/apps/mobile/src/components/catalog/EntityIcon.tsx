import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { t } from '@/i18n/pt-BR';
import { useDetails, type DetailsTarget } from './DetailsSheet';

type Props = {
  icon: string | null | undefined;
  name: string;
  size?: number;
  details?: DetailsTarget;
  onPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  rounded?: boolean;
  testID?: string;
};

/**
 * Icon with placeholder while loading and a name fallback if the image fails (spec §4.4).
 * Long press opens the details panel; a11y label + hint for screen readers (spec §7).
 */
export function EntityIcon({
  icon,
  name,
  size = 48,
  details,
  onPress,
  selected,
  dimmed,
  rounded,
  testID,
}: Props) {
  const { iconUrl } = useCatalog();
  const { open } = useDetails();
  const [failed, setFailed] = useState(false);
  const uri = iconUrl(icon);
  const box = Math.max(size, 48);
  const radius = rounded ? size / 2 : 10;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={name}
      accessibilityHint={details ? t.common.longPressHint : undefined}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      onPress={onPress}
      onLongPress={details ? () => open(details) : undefined}
      delayLongPress={350}
      style={{
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      <View
        style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}
        className={`items-center justify-center bg-surface2 ${selected ? 'border-2 border-accent' : 'border border-border'}`}
      >
        {uri && !failed ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
            placeholder={{ blurhash: 'L03+~p00fQfQ00fQfQfQ00fQfQfQ' }}
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <AppText numberOfLines={2} className="px-1 text-center text-[10px] leading-3 text-muted">
            {name}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}
