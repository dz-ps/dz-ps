import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import ProfileScreen from '@/app/profile';
import { deleteAllMyData } from '@/features/profile/deleteData';
import { loadProfile, toggleStyle } from '@/features/profile/profile';
import { createMemoryStore } from '@/data/store/memoryStore';
import { prefs } from '@/lib/storage';
import { renderApp } from '@/test/renderApp';
import { testRelease } from '@/test/fixtures';

jest.mock('@/data/remote/account', () => ({ deleteRemoteData: jest.fn(async () => 'none') }));

beforeEach(() => prefs.clearAll());

describe('profile (phase 6)', () => {
  it('saves mains, role, elo and style locally', async () => {
    await renderApp({ index: ProfileScreen }, '/');
    await fireEvent.press(await screen.findByTestId('profile-role-jungle'));
    await fireEvent.press(screen.getByTestId('profile-elo-Fx Tier'));
    await fireEvent.press(screen.getByTestId('profile-style-AP'));
    await fireEvent.press(screen.getByTestId('profile-style-AD')); // AD replaces AP
    await fireEvent.press(screen.getByTestId('add-main'));
    const picker = screen.getByTestId('profile-picker');
    await fireEvent.press(within(picker).getByLabelText('Fx Tank'));
    expect(loadProfile()).toEqual({
      mains: ['fx_tank'],
      role: 'jungle',
      elo: 'Fx Tier',
      style: ['AD'],
    });
    expect(prefs.getString('meta.elo')).toBe('Fx Tier');
    await fireEvent.press(screen.getByTestId('main-fx_tank'));
    expect(loadProfile().mains).toEqual([]);
  });

  it('champion pickers understand catalog aliases, not just names', async () => {
    const release = testRelease();
    release.catalog.aliases = { ...release.catalog.aliases, curandeiro: 'fx_healer' };
    await renderApp({ index: ProfileScreen }, '/', { store: createMemoryStore({ release }) });
    await fireEvent.press(await screen.findByTestId('add-main'));
    await fireEvent.changeText(screen.getByTestId('profile-picker-search'), 'curandeiro');
    await waitFor(() => expect(screen.getByTestId('profile-picker-fx_healer')).toBeTruthy());
    expect(screen.queryByTestId('profile-picker-fx_tank')).toBeNull();
  });

  it('records and forgets losses', async () => {
    const { store } = await renderApp({ index: ProfileScreen }, '/');
    await fireEvent.press(await screen.findByTestId('add-loss'));
    await fireEvent.press(within(screen.getByTestId('profile-picker')).getByLabelText('Fx Healer'));
    await waitFor(() => expect(screen.getByText('Fx Healer · 1 derrota')).toBeTruthy());
    expect(await store.getLossLog()).toEqual({ fx_healer: 1 });
    await fireEvent.press(screen.getByLabelText('Remover Fx Healer do registro'));
    await waitFor(async () => expect(await store.getLossLog()).toEqual({}));
  });

  it('"Apagar meus dados" asks first, then wipes user data but keeps the catalog', async () => {
    const store = createMemoryStore({ release: testRelease() });
    await store.setLossLog({ fx_tank: 2 });
    prefs.setJSON('profile', { mains: ['fx_tank'], role: 'mid', elo: null, style: [] });
    await renderApp({ index: ProfileScreen }, '/', { store });
    await fireEvent.press(await screen.findByTestId('delete-data'));
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delete-confirm-yes'));
    await waitFor(() =>
      expect(screen.getByTestId('profile-notice').props.children).toMatch(/foram apagados/),
    );
    expect(await store.getLossLog()).toEqual({});
    expect(loadProfile().mains).toEqual([]);
    expect(await store.loadRelease()).not.toBeNull();
  });

  it('keeps the auth session when the server part fails, so the user can retry', async () => {
    const store = createMemoryStore({ release: testRelease() });
    prefs.setString('sb-x-auth-token', 'session');
    prefs.setString('meta.elo', 'Fx Tier');
    const result = await deleteAllMyData(store, async () => 'failed');
    expect(result.remote).toBe('failed');
    expect(prefs.getString('sb-x-auth-token')).toBe('session');
    expect(prefs.getString('meta.elo')).toBeUndefined();
  });

  it('style toggles keep AP/AD and agressivo/seguro exclusive', () => {
    expect(toggleStyle(['AP', 'agressivo'], 'seguro')).toEqual(['AP', 'seguro']);
    expect(toggleStyle(['AP'], 'AP')).toEqual([]);
  });
});
