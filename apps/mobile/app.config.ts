import type { ExpoConfig } from 'expo/config';

// PLACEHOLDER: the bundle ID / Android package below awaits Chris's confirmation
// (docs/plan.md Q1/Q2). Changing it later is cheap now but painful after store setup.
const BUNDLE_ID = 'com.cboath.sourdoughassistant';

const config: ExpoConfig = {
  name: 'Sourdough Assistant',
  slug: 'sourdough-assistant',
  // Provisional: scheme = bundle ID to avoid collisions (SEC-01 M2). Awaiting Chris's bundle ID.
  scheme: BUNDLE_ID,
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: { supportsTablet: false, bundleIdentifier: BUNDLE_ID },
  android: { package: BUNDLE_ID },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-localization',
    '@react-native-community/datetimepicker',
    // Colors match palette.flour50 / palette.night950 (tokens.ts). No image until brand assets exist (Q5).
    ['expo-splash-screen', { backgroundColor: '#FBF8F3', dark: { backgroundColor: '#14110E' } }],
    // ADR 0001: iOS 18.0 / Android minSdk 31 (provisional until Chris's test devices are known).
    [
      'expo-build-properties',
      { ios: { deploymentTarget: '18.0' }, android: { minSdkVersion: 31 } },
    ],
    // expo-updates config intentionally NOT added: whether OTA ships in v1 is pending
    // Chris's decision (SEC-01 M1, ADR 0015).
  ],
  experiments: { typedRoutes: true },
};

export default config;
