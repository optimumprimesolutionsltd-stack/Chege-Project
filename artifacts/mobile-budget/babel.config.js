module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      // React Compiler — must be explicit because experiments.reactCompiler in
      // app.json skips auto-injection during expo export / eas build.
      'babel-plugin-react-compiler',
    ],
  };
};
