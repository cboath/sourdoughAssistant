import type { ReactNode } from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme/tokens';

export type TextVariant = keyof ReturnType<typeof useTheme>['typography'];

interface TypographyToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle['fontWeight'];
  maxFontSizeMultiplier?: number;
  fontVariant?: ['tabular-nums'];
}

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TextVariant;
  /** A semantic color token (never a raw color). */
  color?: keyof ColorTokens;
  /** Tabular numerals, for times, money and quantities. */
  numeric?: boolean;
  /** Marks the text as a heading for screen-reader rotor navigation. */
  heading?: boolean;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}

/** The only way to render text: applies typography, color, font-scale cap and tabular numerals. */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  numeric = false,
  heading = false,
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const { maxFontSizeMultiplier, fontVariant, ...typo } = theme.typography[
    variant
  ] as TypographyToken;
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessibilityRole={heading ? 'header' : rest.accessibilityRole}
      {...rest}
      style={[
        typo,
        { color: theme.color[color] },
        fontVariant || numeric ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
