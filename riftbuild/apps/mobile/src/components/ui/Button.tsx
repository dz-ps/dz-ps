import { Pressable, type PressableProps } from 'react-native';
import { AppText } from './AppText';

type Kind = 'primary' | 'secondary' | 'ghost' | 'danger';

const kindClass: Record<Kind, string> = {
  primary: 'bg-accent',
  secondary: 'bg-surface2 border border-border',
  ghost: 'bg-transparent',
  danger: 'bg-surface2 border border-danger',
};

const textClass: Record<Kind, string> = {
  primary: 'text-accentText',
  secondary: 'text-text',
  ghost: 'text-info',
  danger: 'text-danger',
};

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  kind?: Kind;
  size?: 'md' | 'lg';
  className?: string;
};

/** Every touchable in the app goes through here so the 48 dp minimum is never forgotten. */
export function Button({
  label,
  kind = 'primary',
  size = 'md',
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={`min-h-touch min-w-touch items-center justify-center rounded-xl px-4 ${
        size === 'lg' ? 'py-5' : 'py-3'
      } ${kindClass[kind]} ${disabled ? 'opacity-40' : ''} ${className ?? ''}`}
      {...rest}
    >
      <AppText
        className={`${size === 'lg' ? 'text-xl' : 'text-base'} font-semibold ${textClass[kind]}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
