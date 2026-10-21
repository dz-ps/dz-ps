// eslint-disable-next-line @typescript-eslint/no-require-imports
const { colors } = require('./colors.js') as { colors: Record<ColorName, string> };

export type ColorName =
  | 'bg'
  | 'surface'
  | 'surface2'
  | 'border'
  | 'control'
  | 'text'
  | 'muted'
  | 'accent'
  | 'accentText'
  | 'info'
  | 'buff'
  | 'nerf'
  | 'adjust'
  | 'danger'
  | 'warning'
  | 'physical'
  | 'magic'
  | 'true';

export const color = colors;

/** Minimum touch target, in dp (spec §7: at least 48 dp). */
export const TOUCH_MIN = 48;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
