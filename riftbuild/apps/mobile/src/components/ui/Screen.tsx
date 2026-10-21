import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

type Props = { children: ReactNode; scroll?: boolean; testID?: string };

export function Screen({ children, scroll = true, testID }: Props) {
  if (!scroll) {
    return (
      <View testID={testID} className="flex-1 bg-bg px-4 pt-3">
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-bg"
      contentContainerClassName="gap-4 px-4 pb-10 pt-3"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
