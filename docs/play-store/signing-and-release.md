# Signing, building and updates

## Keep the APK's key - decide before the first upload

Android installs an update only when it is signed with the same key as the app already on the
phone. Everyone using Jamvi today has an APK signed with the key EAS keeps for
`ke.co.optimumprimesolutions.jamvi` (both `jamvi.apk` and `jamvi-sms.apk`, v2 cert sha256
6428e3dd...).

By default Play generates its own key. Then the Play version would **not** install over the
APK: people would have to uninstall first and lose what lives only on the phone - remembered
payees and categories, nicknames, Named accounts, My business's accounts' numbers, the
message-reading setting. Their entries on the server would be safe, but the rest would be
gone. So give Play our key instead. Play only offers this when the app is created; it cannot
be changed later.

1. Download the keystore from EAS:
   `cd artifacts/mobile-budget && npx eas credentials -p android` › profile **play** ›
   *Keystore: Manage everything needed to build your project* › *Download existing keystore*.
   Note the alias and passwords it prints. Keep the file off the repo and out of chats.
2. Play Console › the app › Test and release › Setup › **App signing** › *Use a different key*
   › **Export and upload a key from Java keystore**. Download Google's PEPK tool and the
   encryption public key it shows, then:
   ```
   java -jar pepk.jar --keystore=jamvi.jks --alias=<alias> --output=jamvi-signing.zip --include-cert --rsa-aes-encryption --encryption-key-path=encryption_public_key.pem
   ```
   Upload `jamvi-signing.zip`.
3. **Upload key**: EAS signs the bundle with the same keystore, so register that certificate as
   the upload key (Play shows it after step 2). A separate upload key can come later.

## Version numbers

- **version** stays **1.0.0**. The runtime version follows it (`runtimeVersion.policy:
  appVersion`), and every in-app update so far is published for 1.0.0 - changing it would cut
  the Play build off from them.
- **versionCode** must be higher than the APK people have (7), or Play cannot update over it.
  Set `android.versionCode` to **8** in app.json for the first Play build, and raise it by one
  for each native build after that, APK or Play.

## Building

```
cd artifacts/mobile-budget
npx eas build -p android --profile play
```

The `play` profile builds an app bundle (.aab), channel **production**, with
`JAMVI_PLAY_STORE=1` - SMS reading left out until Google approves the declaration. For the
second release remove that line from eas.json's `play` profile and build again. Upload the
.aab in Play Console › Production › Create new release (or `eas submit -p android` once a
service account is set up).

## What happens to updates

- **In-app updates go on exactly as now.** The Play build is on the production channel and
  runtime 1.0.0, so every update published with `eas update` (preview, then republished to
  production) reaches it the same way it reaches the APK - no Play review. Play allows this
  because only the JavaScript changes; the app installed from Play stays the same.
- **Native changes** - a new phone ability, a new permission, an Expo SDK upgrade - need a new
  build: raise versionCode, `eas build --profile play`, upload, and Google reviews it (usually
  hours, at times a day or two). Build the APKs from the same commit so all three stay alike.
- Keep publishing to **both** channels as today: APK users read preview, Play users read
  production.
