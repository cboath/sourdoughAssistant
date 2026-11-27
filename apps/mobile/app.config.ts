import type { ExpoConfig } from 'expo/config';

// Bundle ID and Android package are decided (docs/open-questions.md A2). They are effectively
// permanent once the first store upload happens.
const BUNDLE_ID = 'com.cboath.sourdoughassistant';

// Release builds carry no network permission and no push receiver (SEC-M45-01, ADR 0015): the app
// makes no network calls, and expo-notifications bundles Firebase Messaging that must stay inert.
// Development keeps INTERNET for Metro. EAS sets APP_ENV per profile (eas.json).
const RELEASE = process.env.APP_ENV === 'preview' || process.env.APP_ENV === 'production';

const config: ExpoConfig = {
  name: 'Sourdough Assistant',
  slug: 'sourdough-assistant',
  // Deep-link scheme = bundle ID, so no other app claims it (SEC-01 M2, open-questions A2).
  scheme: BUNDLE_ID,
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    // E2: short home-screen name; the store name stays "Sourdough Assistant".
    infoPlist: { CFBundleDisplayName: 'Sourdough' },
  },
  android: {
    package: BUNDLE_ID,
    // Exact alarms for step reminders (SEC-M45-03). Never USE_EXACT_ALARM: Play restricts it.
    permissions: ['android.permission.SCHEDULE_EXACT_ALARM'],
    // AN-01 must verify the MERGED manifest (library manifests can re-add these) and that no
    // google-services.json is present.
    ...(RELEASE
      ? {
          blockedPermissions: [
            'android.permission.INTERNET',
            'com.google.android.c2dm.permission.RECEIVE',
          ],
        }
      : {}),
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-localization',
    ['./plugins/withAndroidAppLabel', 'Sourdough'],
    // Local notifications only (ADR 0011, ADR 0015): no APNs. `enableRemoteNotifications: false`
    // keeps `aps-environment` and the remote-notification background mode out of the build, so a
    // free personal team can still sign it. Default sound only, no custom sound files.
    ['expo-notifications', { enableRemoteNotifications: false }],
    // Time-sensitive entitlement, gated (on for EAS preview/production or SA_TIME_SENSITIVE=1).
    './plugins/withTimeSensitiveNotifications',
    '@react-native-community/datetimepicker',
    // Colors match palette.flour50 / palette.night950 (tokens.ts). No image until brand assets exist (Q5).
    ['expo-splash-screen', { backgroundColor: '#FBF8F3', dark: { backgroundColor: '#14110E' } }],
    // OS minimums are decided: iOS 18.0 / Android minSdk 31 (open-questions A7, ADR 0001).
    [
      'expo-build-properties',
      { ios: { deploymentTarget: '18.0' }, android: { minSdkVersion: 31 } },
    ],
    // OTA is not part of v1 (open-questions A6, ADR 0015 section 5): do NOT add expo-updates,
    // `updates` or `runtimeVersion` config. Revisit in v1.1 with sync.
  ],
  experiments: { typedRoutes: true },
};

export default config;
