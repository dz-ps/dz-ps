import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { CHANGE_LABEL } from '@/i18n/labels';

const STYLE = {
  buff: { icon: '▲', cls: 'border-buff', text: 'text-buff' },
  nerf: { icon: '▼', cls: 'border-nerf', text: 'text-nerf' },
  change: { icon: '◆', cls: 'border-adjust', text: 'text-adjust' },
} as const;

/** Buff/nerf shown with an icon AND text, never color alone (spec §7 accessibility). */
export function BuffNerfTag({
  kind,
  patch,
}: {
  kind: 'buff' | 'nerf' | 'change';
  patch?: string | null;
}) {
  const s = STYLE[kind];
  return (
    <View
      accessibilityLabel={`${CHANGE_LABEL[kind]}${patch ? ` no patch ${patch}` : ''}`}
      className={`flex-row items-center gap-1 self-start rounded-full border px-2 py-0.5 ${s.cls}`}
    >
      <AppText className={`text-xs ${s.text}`}>{s.icon}</AppText>
      <AppText className={`text-xs font-semibold ${s.text}`}>
        {CHANGE_LABEL[kind]}
        {patch ? ` ${patch}` : ''}
      </AppText>
    </View>
  );
}
