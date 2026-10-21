import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import DraftScreen from '@/app/(tabs)/draft';
import { renderApp } from '@/test/renderApp';

jest.mock('@/lib/env', () => ({
  env: {
    hasBackend: true,
    supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'anon',
    manifestUrl: undefined,
  },
}));
jest.mock('@/data/remote/ai', () => ({
  streamDraft: jest.fn(async (_input, _ctx, handlers) => {
    handlers.onMeta({ cached: false, model: 'test' });
    handlers.onSection('build', {
      items: [{ id: 'fx_anti_heal_ap', reason: 'Anti-cura contra o Fx Healer.' }],
      boots: { id: 'fx_boots_b', reason: 'Tenacidade e RM.' },
      runes: null,
      spells: ['smite', 'flash'],
      skill_order: 'Q > W > E',
    });
    handlers.onSection('game_plan', ['Foco no Fx Marksman.']);
  }),
}));

describe('draft assistant (phase 5)', () => {
  it('goes from text to instant read in 3 taps and streams AI sections', async () => {
    await renderApp({ index: DraftScreen }, '/');
    const input = await screen.findByTestId('draft-input');
    await fireEvent.changeText(input, 'fx healer, fx tank, fx marksman'); // 1: type/paste
    await waitFor(() =>
      expect(screen.getByTestId('enemy-slot-2').props.accessibilityLabel).toBe('Fx Marksman'),
    );
    await fireEvent.press(screen.getByTestId('draft-analyze')); // 2
    expect(screen.getByTestId('confirm-strip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('draft-confirm')); // 3
    await waitFor(() => expect(screen.getByTestId('comp-read')).toBeTruthy());
    const ms = Number(
      /(\d+) ms/.exec(screen.getByTestId('comp-time').props.children.join(''))?.[1],
    );
    expect(ms).toBeLessThan(1000);
    await waitFor(() => expect(screen.getByText('Anti-cura contra o Fx Healer.')).toBeTruthy());
    expect(screen.getByText('• Foco no Fx Marksman.')).toBeTruthy();
    expect(screen.getByText('Q > W > E')).toBeTruthy();
  });

  it('reports what it could not recognize', async () => {
    await renderApp({ index: DraftScreen }, '/');
    await fireEvent.changeText(await screen.findByTestId('draft-input'), 'fx healer xyzzy');
    await waitFor(() => expect(screen.getByTestId('draft-unresolved')).toBeTruthy());
    expect(screen.getByText(/xyzzy/)).toBeTruthy();
  });
});
