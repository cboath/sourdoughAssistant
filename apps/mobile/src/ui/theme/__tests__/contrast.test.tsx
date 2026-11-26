import { contrastRatio } from '../contrast';
import { color, type ColorTokens, type ColorScheme } from '../tokens';

type Pair = [fg: keyof ColorTokens, bg: keyof ColorTokens, min: number];

// docs/design/tokens.md section 2.3, plus every text-on-container pairing the base components use.
const TEXT = 4.5;
const UI = 3;
const PAIRS: Pair[] = [
  ['textPrimary', 'background', TEXT],
  ['textPrimary', 'surface', TEXT],
  ['textPrimary', 'surfaceSunken', TEXT],
  ['textSecondary', 'background', TEXT],
  ['textSecondary', 'surface', TEXT],
  ['textSecondary', 'surfaceSunken', TEXT],
  ['accent', 'surface', TEXT],
  ['accent', 'background', TEXT],
  ['textOnAccent', 'accent', TEXT],
  ['textOnAccentContainer', 'accentContainer', TEXT],
  ['textOnDanger', 'danger', TEXT],
  ['danger', 'surface', TEXT],
  ['textOnDangerContainer', 'dangerContainer', TEXT],
  ['warning', 'surface', TEXT],
  ['warning', 'warningContainer', TEXT],
  ['textOnWarningContainer', 'warningContainer', TEXT],
  ['success', 'surface', TEXT],
  ['textOnSuccessContainer', 'successContainer', TEXT],
  ['info', 'surface', TEXT],
  ['textOnInfoContainer', 'infoContainer', TEXT],
  ['borderStrong', 'surface', UI],
  ['focusRing', 'surface', UI],
];

describe('design token contrast (WCAG 2.2 AA)', () => {
  const schemes: ColorScheme[] = ['light', 'dark'];
  for (const scheme of schemes) {
    describe(scheme, () => {
      it.each(PAIRS)('%s on %s meets %d:1', (fg, bg, min) => {
        const ratio = contrastRatio(color[scheme][fg], color[scheme][bg]);
        expect(ratio).toBeGreaterThanOrEqual(min);
      });
    });
  }

  it('computes known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('keeps the light and dark palettes on identical semantic names', () => {
    expect(Object.keys(color.dark).sort()).toEqual(Object.keys(color.light).sort());
  });
});
