/**
 * Adds the `com.apple.developer.usernotifications.time-sensitive` entitlement (IO-01, ADR 0011 s5).
 *
 * Gated, because a free personal-team build may not be able to sign it (docs/native/ios-notifications.md).
 * Resolution order:
 *   1. `SA_TIME_SENSITIVE=1` forces it on, `SA_TIME_SENSITIVE=0` forces it off.
 *   2. Otherwise on only for the EAS `preview` and `production` profiles (paid account, M6).
 *   3. Otherwise off (local `expo run:ios`, free 7-day installs, Simulator).
 * Without the entitlement iOS ignores `interruptionLevel: 'timeSensitive'` and delivers at `active`.
 * Never adds `aps-environment` or a `remote-notification` background mode (no push, ADR 0015).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- config plugins are CommonJS */
const { withEntitlementsPlist } = require('expo/config-plugins');

const KEY = 'com.apple.developer.usernotifications.time-sensitive';

function isEnabled(env) {
  if (env.SA_TIME_SENSITIVE === '1') return true;
  if (env.SA_TIME_SENSITIVE === '0') return false;
  return env.EAS_BUILD_PROFILE === 'preview' || env.EAS_BUILD_PROFILE === 'production';
}

module.exports = function withTimeSensitiveNotifications(config) {
  return withEntitlementsPlist(config, (cfg) => {
    if (isEnabled(process.env)) cfg.modResults[KEY] = true;
    else delete cfg.modResults[KEY];
    return cfg;
  });
};
module.exports.isEnabled = isEnabled;
