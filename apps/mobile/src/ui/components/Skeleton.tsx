import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';

export interface SkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
  testID?: string;
}

function Bar({ width, opacity }: { width: DimensionValue; opacity: Animated.Value }) {
  const { color, radius } = useTheme();
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no"
      style={{
        width,
        height: 14,
        borderRadius: radius.xs,
        backgroundColor: color.skeleton,
        opacity,
      }}
    />
  );
}

/** Cold-start placeholder shaped like ListRows. The pulse runs on the native driver; static with reduce motion. */
export function Skeleton({ rows = 6, testID }: SkeletonProps) {
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
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ paddingVertical: space.md, gap: space.sm }}>
          <Bar width="60%" opacity={pulse} />
          <Bar width="40%" opacity={pulse} />
        </View>
      ))}
    </View>
  );
}
