/**
 * app.json, plus the note an over-the-air update carries.
 *
 * The "Update ready" prompt is shown by the version already on the phone,
 * before the new one is downloaded, so all it can read is the update's
 * manifest. `eas update --message` never reaches the manifest - the prompt
 * always fell back to "the latest improvements and fixes". The app config
 * does reach it (as extra.expoClient), so the note goes in here:
 *
 *   JAMVI_UPDATE_NOTE="Business: Show all details | Home leaves side-hustle costs out" npx eas update ...
 *
 * Items are separated by "|" and shown as a list. Only extra changes; the
 * runtime version follows the app version, so this cannot strand an update.
 */
const { withGradleProperties } = require('expo/config-plugins');

/**
 * The APK people download from jamvi.co.ke carries native code for ARM only.
 * x86 and x86_64 are emulators and the odd Chromebook, and were 42 MB of a
 * 106 MB file. armeabi-v7a stays for 32-bit budget phones. The Play Store
 * bundle keeps all four: Google gives each phone only its own.
 */
const APK_ARCHITECTURES = 'armeabi-v7a,arm64-v8a';
const withArmOnly = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'));
    cfg.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: APK_ARCHITECTURES });
    return cfg;
  });

module.exports = ({ config }) => {
  const note = (process.env.JAMVI_UPDATE_NOTE ?? '').trim();
  // A Play Store build (eas.json "play") leaves out reading SMS until Google
  // approves the SMS declaration: the permission the jamvi-sms module asks for
  // is removed, and the "Read my M-Pesa messages" button then hides itself.
  // Approved, delete JAMVI_PLAY_STORE from that profile and it is on.
  const playStore = process.env.JAMVI_PLAY_STORE === '1';
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ...(playStore ? [] : [withArmOnly])],
    android: {
      ...config.android,
      ...(playStore ? { blockedPermissions: [...(config.android?.blockedPermissions ?? []), 'android.permission.READ_SMS', 'android.permission.RECEIVE_SMS'] } : {}),
    },
    extra: { ...config.extra, ...(note ? { updateNote: note } : {}) },
  };
};
