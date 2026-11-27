import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';

export interface SkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** `detail`: a heading bar and a card-shaped block above the rows (detail screens). */
  variant?: 'list' | 'detail' | 'card' | 'panel';
  testID?: string;
}

function Bar({
  width,
  opacity,
  height,
}: {
  width: DimensionValue;
  opacity: Animated.Value;
  height?: number;
}) {
  const { color, radius, space } = useTheme();
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no"
      style={{
        width,
        height: height ?? space.md,
        borderRadius: radius.xs,
        backgroundColor: color.skeleton,
        opacity,
      }}
    />
  );
}

/** Cold-start placeholder shaped like ListRows. The pulse runs on the native driver; static with reduce motion. */
export function Skeleton({ rows = 6, variant = 'list', testID }: SkeletonProps) {
  const { space, layout, motion } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return undefined;
    }
    const half = motion.duration.skeletonPulse / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: half, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: half, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse, motion.duration.skeletonPulse]);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      style={{ paddingHorizontal: layout.screenMargin }}
    >
      {variant === 'detail' ? (
        <View style={{ paddingVertical: space.md, gap: space.lg }}>
          <Bar width="50%" opacity={pulse} height={space.xl} />
          <Bar width="100%" opacity={pulse} height={space.huge * 2} />
        </View>
      ) : null}
      {variant === 'card'
        ? Array.from({ length: 2 }, (_, i) => (
            <View key={i} style={{ paddingVertical: space.md, gap: space.md }}>
              <Bar width="60%" opacity={pulse} height={space.lg} />
              <Bar width="40%" opacity={pulse} height={space.xl} />
              <Bar width="100%" opacity={pulse} height={space.sm} />
            </View>
          ))
        : null}
      {variant === 'panel' ? (
        <View style={{ paddingVertical: space.md, gap: space.lg }}>
          <Bar width="50%" opacity={pulse} height={space.xl} />
          <Bar width="70%" opacity={pulse} height={space.huge + space.xl} />
        </View>
      ) : null}
      {Array.from({ length: variant === 'card' ? 0 : variant === 'panel' ? 3 : rows }, (_, i) => (
        <View key={i} style={{ paddingVertical: space.md, gap: space.sm }}>
          <Bar width="60%" opacity={pulse} />
          <Bar width="40%" opacity={pulse} />
        </View>
      ))}
    </View>
  );
}
