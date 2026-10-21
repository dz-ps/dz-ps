import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import BuildEditorScreen from '@/app/build/[id]';
import { renderApp } from '@/test/renderApp';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/card.png'),
}));

async function openEditor() {
  await renderApp({ 'build/[id]': BuildEditorScreen }, '/build/new');
  await waitFor(() => expect(screen.getByTestId('slot-0')).toBeTruthy());
}

async function pickItem(slot: number, itemId: string) {
  await fireEvent.press(screen.getByTestId(`slot-${slot}`));
  await waitFor(() => expect(screen.getByTestId(`item-picker-${itemId}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`item-picker-${itemId}`));
}

describe('build creator (phase 3 acceptance)', () => {
  it('blocks a second pair of boots and leaves the slots unchanged', async () => {
    await openEditor();
    await pickItem(0, 'fx_boots_a');
    await waitFor(() =>
      expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe('Fx Boots A'),
    );
    await pickItem(1, 'fx_boots_b');
    await waitFor(() => expect(screen.getByTestId('blocked-message')).toBeTruthy());
    expect(
      within(screen.getByTestId('blocked-message')).getByText('Só é possível usar uma bota.'),
    ).toBeTruthy();
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe('Slot 2 vazio');
  });

  it('warns when two items share a unique passive (Spellblade)', async () => {
    await openEditor();
    await pickItem(0, 'fx_item_spellblade_1');
    await pickItem(1, 'fx_item_spellblade_2');
    await waitFor(() => expect(screen.getByTestId('item-warning')).toBeTruthy());
    expect(screen.getByText(/Spellblade.*não acumula/)).toBeTruthy();
  });

  it('disables Salvar until the rune page is valid', async () => {
    await openEditor();
    const save = () => screen.getByTestId('save-build');
    expect(save().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('keystone-fx_keystone_a'));
    await fireEvent.press(screen.getByRole('tab', { name: 'Dominação' }));
    for (const id of ['fx_domination_1_a', 'fx_domination_2_a', 'fx_domination_3_a']) {
      await fireEvent.press(screen.getByTestId(`primary-${id}`));
    }
    expect(save().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('secondary-fx_resolve_1_a'));
    await waitFor(() => expect(screen.getByTestId('rune-ok')).toBeTruthy());
    expect(save().props.accessibilityState.disabled).toBe(false);
  });

  it('renders the share card with the build icons', async () => {
    await openEditor();
    await pickItem(0, 'fx_mr_item');
    const card = screen.getByTestId('share-card', { includeHiddenElements: true });
    expect(
      within(card).getAllByLabelText('Fx MR Item', { includeHiddenElements: true }).length,
    ).toBe(1);
  });
});
