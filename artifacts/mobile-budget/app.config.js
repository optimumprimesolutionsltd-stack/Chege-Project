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
module.exports = ({ config }) => {
  const note = (process.env.JAMVI_UPDATE_NOTE ?? '').trim();
  // A Play Store build (eas.json "play") leaves out reading SMS until Google
  // approves the SMS declaration: the permission the jamvi-sms module asks for
  // is removed, and the "Read my M-Pesa messages" button then hides itself.
  // Approved, delete JAMVI_PLAY_STORE from that profile and it is on.
  const playStore = process.env.JAMVI_PLAY_STORE === '1';
  return {
    ...config,
    android: {
      ...config.android,
      ...(playStore ? { blockedPermissions: [...(config.android?.blockedPermissions ?? []), 'android.permission.READ_SMS', 'android.permission.RECEIVE_SMS'] } : {}),
    },
    extra: { ...config.extra, ...(note ? { updateNote: note } : {}) },
  };
};
