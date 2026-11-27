/** Sets the Android launcher label (res/values/strings.xml app_name) without renaming the app. */
/* eslint-disable @typescript-eslint/no-require-imports -- config plugins are CommonJS */
const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

module.exports = function withAndroidAppLabel(config, label) {
  return withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name' }, _: label }],
      cfg.modResults,
    );
    return cfg;
  });
};
