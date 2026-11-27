import { Tabs } from 'expo-router/js-tabs';
import { Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOvertimeCount } from '../../src/features/live/hooks/useLiveData';
import { t, tp, type MessageKey } from '../../src/lib/i18n';
import { RouteErrorBoundary } from '../../src/ui/components/RouteErrorBoundary';
import { Icon, type IconName } from '../../src/ui/components/Icon';
import { useSnackbarClearance } from '../../src/ui/hooks/useSnackbarClearance';
import { useTheme } from '../../src/ui/theme';

export { RouteErrorBoundary as ErrorBoundary };

const TABS: ReadonlyArray<{ name: string; title: MessageKey; icon: IconName }> = [
  { name: 'bakes', title: 'tabs.bakes', icon: 'timer' },
  { name: 'recipes', title: 'tabs.recipes', icon: 'book' },
  { name: 'pantry', title: 'tabs.pantry', icon: 'pantry' },
  { name: 'settings', title: 'tabs.settings', icon: 'settings' },
];

export default function TabsLayout() {
  const { color, layout, space, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Steps past their time across every bake (flows 1.1). Hidden at 0.
  const overdue = useOvertimeCount();
  // Android at >= 600 dp (tablets, unfolded foldables) uses a navigation rail instead of the bar.
  const rail = Platform.OS === 'android' && width >= layout.wideBreakpoint;
  // Snackbars sit above the tab bar (it is not measured: these are the platform defaults).
  useSnackbarClearance(
    rail
      ? 0
      : Platform.OS === 'ios'
        ? layout.tabBarHeightIos + insets.bottom
        : layout.tabBarHeightAndroid,
  );
  return (
    <Tabs
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarPosition: rail ? 'left' : 'bottom',
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarStyle: { backgroundColor: color.surface, borderColor: color.border },
        tabBarLabelStyle: { fontSize: typography.caption.fontSize },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarAccessibilityLabel:
              tab.name === 'bakes' && overdue > 0 ? tp('tab.bakes.badge', overdue) : t(tab.title),
            ...(tab.name === 'bakes' && overdue > 0 ? { tabBarBadge: overdue } : {}),
            tabBarIcon: ({ focused }) =>
              Platform.OS === 'android' ? (
                // M3 active indicator: a pill behind the selected icon.
                <View
                  style={{
                    paddingHorizontal: space.lg,
                    paddingVertical: space.xs,
                    borderRadius: radius.full,
                    backgroundColor: focused ? color.accentContainer : 'transparent',
                  }}
                >
                  <Icon
                    name={tab.icon}
                    color={focused ? 'textOnAccentContainer' : 'textSecondary'}
                  />
                </View>
              ) : (
                <Icon name={tab.icon} color={focused ? 'accent' : 'textSecondary'} />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}
