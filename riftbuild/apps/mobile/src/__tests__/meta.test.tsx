import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import HomeScreen from '@/app/(tabs)/index';
import MetaScreen from '@/app/(tabs)/meta';
import { renderApp } from '@/test/renderApp';

function expectProvenance() {
  const stats = screen.getAllByTestId(/^stat-/);
  expect(stats.length).toBeGreaterThan(0);
  for (const node of stats) {
    expect(node.props.accessibilityLabel).toMatch(/Fonte .+, coletado em \d{2}\/\d{2}\/\d{4}/);
  }
}

describe('meta (phase 4 acceptance: every number shows source and date)', () => {
  it('tier list rows carry source and collection date', async () => {
    await renderApp({ index: MetaScreen }, '/');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Selva' }));
    await waitFor(() => expect(screen.getByTestId('stat-wr-fx_tank')).toBeTruthy());
    expectProvenance();
    expect(screen.getByText(/Fonte: /)).toBeTruthy();
  });

  it('"O que mudou" shows buffs/nerfs with icon and text', async () => {
    await renderApp({ index: MetaScreen }, '/');
    await fireEvent.press(await screen.findByRole('tab', { name: 'O que mudou' }));
    await waitFor(() => expect(screen.getByTestId('change-fx_tank')).toBeTruthy());
    expect(screen.getByLabelText('Buff')).toBeTruthy();
    expect(screen.getByText('▲')).toBeTruthy();
  });

  it('home trending champions carry source and date', async () => {
    await renderApp({ index: HomeScreen }, '/');
    await waitFor(() => expect(screen.getByTestId('stat-trend-jungle')).toBeTruthy());
    expectProvenance();
  });
});
