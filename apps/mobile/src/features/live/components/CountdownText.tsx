import { useMemo } from 'react';
import { clock, useNow } from '../../../lib/clock';
import { Text } from '../../../ui/components';
import type { ColorTokens } from '../../../ui/theme/tokens';
import { countdownRuns, formatCountdown, overText } from '../format';
import type { PanelModel } from '../panel';

const HOUR_MS = 3_600_000;

export interface CountdownTextProps {
  model: Pick<PanelModel, 'countdown' | 'countdownKind' | 'countdownTarget'>;
  locale: string;
  compact: boolean;
  color: keyof ColorTokens;
  testID?: string;
}

/**
 * The only part of the live view that re-renders every second, and only while the countdown is
 * under an hour (DR2-27). Numerals are `timerHero`; the unit words are `title2` on the same
 * baseline, and the value stays on one line, shrinking before it would wrap (DR2-03).
 */
export function CountdownText({ model, locale, compact, color, testID }: CountdownTextProps) {
  const { countdownTarget: target, countdownKind: kind } = model;
  const dynamic = target !== null && kind !== 'text';
  const interval = dynamic && Math.abs((target as number) - clock.now()) < HOUR_MS ? 1000 : 30_000;
  const now = useNow(interval);
  const text = useMemo(() => {
    if (!dynamic) return model.countdown;
    const ms = (target as number) - now;
    if (kind === 'over' || ms < 0) return overText(Math.max(0, -ms), locale);
    return formatCountdown(ms, locale);
  }, [dynamic, target, now, kind, locale, model.countdown]);
  const runs = countdownRuns(text);
  return (
    <Text
      testID={testID}
      variant={kind === 'text' ? 'title2' : compact ? 'timerLarge' : 'timerHero'}
      numeric
      color={color}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={{ flexShrink: 1 }}
    >
      {runs.map((run, i) =>
        run.unit ? (
          <Text key={i} variant="title2" numeric color={color}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
}
