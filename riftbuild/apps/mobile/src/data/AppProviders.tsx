import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DetailsProvider } from '@/components/catalog/DetailsSheet';
import { color } from '@/theme/tokens';
import { CatalogProvider, type CatalogProviderProps } from './catalog/CatalogProvider';
import { openPlatformStore } from './store/platform';
import type { AppStore } from './store/types';

type Props = { children: ReactNode; store?: AppStore; syncDeps?: CatalogProviderProps['syncDeps'] };

/** Opens local storage, then provides catalog, details panel and query client to the whole app. */
export function AppProviders({ children, store: injected, syncDeps }: Props) {
  const [store, setStore] = useState<AppStore | null>(injected ?? null);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } } }),
  );
  useEffect(() => {
    if (!injected) void openPlatformStore().then(setStore);
  }, [injected]);

  if (!store) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <CatalogProvider store={store} syncDeps={syncDeps}>
        <DetailsProvider>{children}</DetailsProvider>
      </CatalogProvider>
    </QueryClientProvider>
  );
}
