import { Text, type TextProps } from 'react-native';

type Variant = 'title' | 'heading' | 'body' | 'caption' | 'label';

const variantClass: Record<Variant, string> = {
  title: 'text-2xl font-bold',
  heading: 'text-lg font-semibold',
  body: 'text-base',
  caption: 'text-sm',
  label: 'text-sm font-semibold uppercase tracking-wide',
};

const variantColor: Record<Variant, string> = {
  title: 'text-text',
  heading: 'text-text',
  body: 'text-text',
  caption: 'text-muted',
  label: 'text-muted',
};

// Two text-color utilities on one element resolve by stylesheet order, not by class order,
// so the variant's default color is dropped whenever the caller passes its own.
const COLOR_CLASS =
  /(^|\s)text-(bg|surface2?|border|text|muted|accent|accentText|info|buff|nerf|adjust|danger|warning|physical|magic|true)(\s|$)/;

export type AppTextProps = TextProps & { variant?: Variant; className?: string };

export function AppText({ variant = 'body', className = '', ...rest }: AppTextProps) {
  const colorClass = COLOR_CLASS.test(className) ? '' : variantColor[variant];
  return (
    <Text
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      className={`${variantClass[variant]} ${colorClass} ${className}`.trim()}
      {...rest}
    />
  );
}
