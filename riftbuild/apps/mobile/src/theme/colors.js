// Single source of truth for the dark, high-contrast palette.
// Used by tailwind.config.js (classNames) and by src/theme/tokens.ts (JS styles, contrast tests).
const colors = {
  bg: '#0B0E14',
  surface: '#151A23',
  surface2: '#1E2531',
  border: '#2C3544', // decorative separators and card edges
  control: '#66768E', // outlines that identify a control (inputs, chips): WCAG 1.4.11 needs 3:1
  text: '#F2F4F8',
  muted: '#A9B3C4',
  accent: '#E8B341',
  accentText: '#0B0E14',
  info: '#6CB8FF',
  buff: '#4ADE80',
  nerf: '#F87171',
  adjust: '#FBBF24',
  danger: '#F87171',
  warning: '#FBBF24',
  physical: '#FB923C',
  magic: '#A78BFA',
  true: '#F2F4F8',
};

module.exports = { colors };
