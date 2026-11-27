import { Redirect } from 'expo-router';

/**
 * IO-01 spike route. DEVELOPMENT ONLY. In release builds `__DEV__` is false, Metro drops the
 * `require` branch (the spike modules and their expo-notifications calls are not bundled from
 * here), and this route renders a redirect to `/`. External links cannot reach it either: the
 * deep-link allowlist (`src/lib/deepLinks.ts`) only admits it when `__DEV__` is true.
 */
function ReleaseRedirect() {
  return <Redirect href="/" />;
}

const Screen: () => React.JSX.Element = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay out of release bundles
    require('../src/features/notifications/spike/NotificationSpikeScreen').NotificationSpikeScreen
  : ReleaseRedirect;

export default Screen;
