import { Tabs } from 'expo-router/js-tabs';
import { Platform, useWindowDimensions } from 'react-native';
import { t, type MessageKey } from '../../src/lib/i18n';
import { RouteErrorBoundary } from '../../src/ui/components/RouteErrorBoundary';
import { Icon, type IconName } from '../../src/ui/components/Icon';
import { useTheme } from '../../src/ui/theme';

export { RouteErrorBoundary as ErrorBoundary };

const TABS: ReadonlyArray<{ name: string; title: MessageKey; icon: IconName }> = [
  { name: 'bakes', title: 'tabs.bakes', icon: 'timer' },
  { name: 'recipes', title: 'tabs.recipes', icon: 'book' },
  { name: 'pantry', title: 'tabs.pantry', icon: 'pantry' },
  { name: 'settings', title: 'tabs.settings', icon: 'settings' },
];

export default function TabsLayout() {
  const { color, layout, size } = useTheme();
  const { width } = useWindowDimensions();
  // Android at >= 600 dp (tablets, unfolded foldables) uses a navigation rail instead of the bar.
  const rail = Platform.OS === 'android' && width >= layout.wideBreakpoint;
  return (
    <Tabs
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarPosition: rail ? 'left' : 'bottom',
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarStyle: { backgroundColor: color.surface, borderColor: color.border },
        tabBarLabelStyle: { fontSize: size.iconSm - 6 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarAccessibilityLabel: t(tab.title),
            tabBarIcon: ({ focused }) => (
              <Icon name={tab.icon} color={focused ? 'accent' : 'textSecondary'} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
