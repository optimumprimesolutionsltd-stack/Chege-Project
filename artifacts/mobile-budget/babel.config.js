module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // Explicit plugin ensures consistent behaviour between eas build and eas update (OTA export).
    // experiments.reactCompiler in app.json auto-injects this but the auto-injection
    // is skipped during expo export, causing a private class fields parse error in the bundle.
    plugins: ['babel-plugin-react-compiler'],
  };
};
