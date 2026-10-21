import { screen, waitFor } from 'expo-router/testing-library';
import HomeScreen from '@/app/(tabs)/index';
import { releaseFromSeed } from '@/data/catalog/sync';
import { createMemoryStore } from '@/data/store/memoryStore';
import { renderApp } from '@/test/renderApp';
import { testRelease } from '@/test/fixtures';

const release = testRelease();
const mockSeed = { generated_at: '2026-10-21T00:00:00Z', ...release };

jest.mock('@/lib/env', () => ({
  env: { hasBackend: false, allowFixtures: true, allowPartial: false, manifestUrl: undefined },
}));
jest.mock('@/data/catalog/seed', () => ({ bundledSeed: () => mockSeed }));

describe('build-time seed (offline first launch)', () => {
  it('validates the seed with the same rules as a download', () => {
    expect(releaseFromSeed(null, { allowFixtures: true, allowPartial: false })).toBeNull();
    expect(
      releaseFromSeed({ catalog: {} }, { allowFixtures: true, allowPartial: false }),
    ).toBeNull();
    // fixture bundles are refused outside dev, exactly like sync
    expect(releaseFromSeed(mockSeed, { allowFixtures: false, allowPartial: false })).toBeNull();
    const ok = releaseFromSeed(mockSeed, { allowFixtures: true, allowPartial: false })!;
    expect(ok.catalogHash).toBe(release.manifest.catalog!.hash);
    expect(ok.catalog.champions.length).toBe(release.catalog.champions.length);
  });

  it('a fresh install with no network opens on the embedded seed and stores it', async () => {
    const store = createMemoryStore();
    await renderApp({ index: HomeScreen }, '/', { store, syncDeps: null });
    await waitFor(() =>
      expect(screen.getByText(`Dados do patch ${release.catalog.patch}`)).toBeTruthy(),
    );
    expect((await store.loadRelease())?.catalogHash).toBe(release.manifest.catalog!.hash);
  });
});
