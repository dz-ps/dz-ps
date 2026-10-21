import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { AppProviders } from '@/data/AppProviders';
import type { CatalogProviderProps } from '@/data/catalog/CatalogProvider';
import { createMemoryStore } from '@/data/store/memoryStore';
import type { AppStore } from '@/data/store/types';
import { testRelease } from './fixtures';

type Options = { store?: AppStore; syncDeps?: CatalogProviderProps['syncDeps'] };

/** Renders screens inside the real providers with an in-memory store holding the fixture release. */
export async function renderApp(
  routes: Record<string, ComponentType>,
  initialUrl: string,
  options: Options = {},
) {
  const store = options.store ?? createMemoryStore({ release: testRelease() });
  function Layout() {
    return (
      <AppProviders store={store} syncDeps={options.syncDeps ?? null}>
        <Stack />
      </AppProviders>
    );
  }
  const result = await renderRouter({ _layout: Layout, ...routes }, { initialUrl });
  return { ...result, store };
}
