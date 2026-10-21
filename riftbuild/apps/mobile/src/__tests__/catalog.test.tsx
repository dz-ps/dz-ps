import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import CatalogScreen from '@/app/(tabs)/catalog';
import ItemScreen from '@/app/item/[id]';
import ChampionScreen from '@/app/champion/[id]';
import { createMemoryStore } from '@/data/store/memoryStore';
import { renderApp } from '@/test/renderApp';
import { testRelease } from '@/test/fixtures';

describe('catalog (phase 2 acceptance)', () => {
  it('finds Amumu when searching "mumu"', async () => {
    await renderApp({ index: CatalogScreen }, '/');
    await waitFor(() => expect(screen.getByTestId('catalog-search')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('catalog-search'), 'mumu');
    await waitFor(() => expect(screen.getByTestId('champion-amumu')).toBeTruthy());
    expect(screen.queryByTestId('champion-fx_healer')).toBeNull();
  });

  it('shows an item recipe tree with icons', async () => {
    await renderApp({ 'item/[id]': ItemScreen }, '/item/fx_anti_heal_ap');
    await waitFor(() => expect(screen.getByTestId('recipe-fx_anti_heal_ap')).toBeTruthy());
    expect(screen.getByTestId('recipe-fx_component')).toBeTruthy();
    expect(screen.getAllByLabelText('Fx Component').length).toBeGreaterThan(0);
    expect(screen.getByText(/Fonte: /)).toBeTruthy();
  });

  it('works offline: network fails, the stored catalog still renders', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await renderApp({ 'champion/[id]': ChampionScreen }, '/champion/fx_tank', {
      store: createMemoryStore({ release: testRelease() }),
      syncDeps: {
        manifestUrl: 'https://example.invalid/manifest.json',
        fetchFn,
        digest: async () => new ArrayBuffer(32),
      },
    });
    await waitFor(() => expect(screen.getByTestId('ability-Q')).toBeTruthy());
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(screen.getAllByText(/Fx Pull/).length).toBeGreaterThan(0);
  });

  it('warns when the data patch is behind the game patch', async () => {
    await renderApp({ 'champion/[id]': ChampionScreen }, '/champion/fx_tank', {
      store: createMemoryStore({ release: testRelease({ gamePatch: '10.0' }) }),
    });
    await waitFor(() => expect(screen.getByTestId('stale-banner')).toBeTruthy());
    expect(screen.getByText('Dados do patch 9.9z. O jogo está no patch 10.0.')).toBeTruthy();
  });

  it('every meta number on the champion page carries its source and date', async () => {
    await renderApp({ 'champion/[id]': ChampionScreen }, '/champion/fx_tank');
    await waitFor(() => expect(screen.getByTestId('stat-win')).toBeTruthy());
    for (const node of screen.getAllByTestId(/^stat-/)) {
      expect(node.props.accessibilityLabel).toMatch(/Fonte .+, coletado em \d{2}\/\d{2}\/\d{4}/);
    }
  });
});
