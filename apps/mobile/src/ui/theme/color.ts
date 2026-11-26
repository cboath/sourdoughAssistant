import { parseHex } from './contrast';

/** `#RRGGBB` + alpha 0..1 to an `rgba()` string, for state layers and ripples. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
