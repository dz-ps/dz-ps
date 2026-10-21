import { color, type ColorName } from '@/theme/tokens';

// WCAG 2.1 contrast (spec §7: dark theme, high contrast). Body text needs 4.5:1 (AA); large text and
// non-text UI (borders of controls, icons) need 3:1.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const backgrounds: ColorName[] = ['bg', 'surface', 'surface2'];
const textTokens: ColorName[] = [
  'text',
  'muted',
  'accent',
  'info',
  'buff',
  'nerf',
  'adjust',
  'danger',
  'warning',
  'physical',
  'magic',
];

describe('theme contrast (WCAG 2.1 AA)', () => {
  it.each(textTokens.flatMap((fg) => backgrounds.map((bg) => [fg, bg] as const)))(
    '%s on %s is at least 4.5:1',
    (fg, bg) => {
      expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(backgrounds)('control outlines on %s are at least 3:1 (WCAG 1.4.11)', (bg) => {
    expect(contrast(color.control, color[bg])).toBeGreaterThanOrEqual(3);
  });

  it('primary button text on accent is at least 4.5:1', () => {
    expect(contrast(color.accentText, color.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('the formula matches known values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
});
