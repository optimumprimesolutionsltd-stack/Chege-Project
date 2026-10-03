import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, PermissionsAndroid: {} }));

import { canNotifySms, canReadSms, MPESA_SENDERS, SMS_PERIODS, smsPeriodRange, newSmsTitle, parseSmsAuto, smsBatches, smsBodies, smsRefusal } from '@/lib/mpesaSms';

// Asked for 2 Oct 2026: read M-Pesa's messages on request, and each time Jamvi
// opens, from an APK now and the Play Store later.
describe('reading M-Pesa messages from the phone', () => {
  it('is never offered where the native side is missing - an old APK, iPhone, web', () => {
    expect(canReadSms()).toBe(false);
  });

  it('keeps M-Pesa messages in order and in batches the reader takes', () => {
    expect(smsBodies([{ body: ' B ', date: 2 }, { body: '', date: 3 }, { body: 'A', date: 1 }])).toEqual(['A', 'B']);
    const many = Array.from({ length: 320 }, (_, i) => `QX${i} Confirmed. Ksh100.00 sent`);
    const batches = smsBatches(many);
    expect(batches.map((batch) => batch.length)).toEqual([150, 150, 20]);
    expect(batches.flat()).toEqual(many);
    expect(smsBatches(['x'.repeat(60_000), 'y'.repeat(60_000)]).length).toBe(2);
    expect(MPESA_SENDERS).toEqual(['MPESA']);
  });

  it('remembers whether to look for new ones, and from when', () => {
    expect(parseSmsAuto(null)).toEqual({ on: false, since: 0 });
    expect(parseSmsAuto('{"on":true,"since":5}')).toEqual({ on: true, since: 5 });
    expect(parseSmsAuto('garbage')).toEqual({ on: false, since: 0 });
    expect(newSmsTitle(1)).toBe('1 new M-Pesa message');
  });

  it('says plainly why it could not read them', () => {
    expect(smsRefusal('blocked')).toContain('Settings > Apps > Jamvi > Permissions > SMS');
    expect(smsRefusal('unavailable')).toContain('newest Jamvi app');
  });
});

// Asked for 3 Oct 2026: "a period, instead of just the months" - chips, not a calendar.
describe('choosing a period to read', () => {
  const today = new Date(2026, 9, 3); // 3 Oct 2026
  it('offers a month (with the arrows) and periods ending today', () => {
    expect(SMS_PERIODS.map((period) => period.label)).toEqual(['Today', 'A month', 'Last 7 days', 'Last 30 days', 'Last 3 months', 'Last 6 months', 'This year', 'Last 12 months', 'Pick dates']);
    expect(smsPeriodRange('today', today)).toEqual({ from: '2026-10-03', to: '2026-10-03' });
    expect(smsPeriodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-03' });
    expect(smsPeriodRange('days7', today)).toEqual({ from: '2026-09-27', to: '2026-10-03' });
    expect(smsPeriodRange('days30', today)).toEqual({ from: '2026-09-04', to: '2026-10-03' });
    expect(smsPeriodRange('months3', today)).toEqual({ from: '2026-07-04', to: '2026-10-03' });
    expect(smsPeriodRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-10-03' });
    expect(smsPeriodRange('months12', today)).toEqual({ from: '2025-10-04', to: '2026-10-03' });
  });

  it('shows the chips on the card, and the arrows only for a month', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('testID="mpesa-sms-periods"');
    expect(screen).toContain("{smsPeriod === 'month' ? (");
    // "I still need to be able to specify a specific date".
    expect(screen).toContain(") : smsPeriod === 'dates' ? (");
    expect(screen).toContain('testID={`mpesa-sms-date-${which}`}');
  });
});

describe('the build', () => {
  it('asks for READ_SMS from the jamvi-sms module, reading only the senders asked for', () => {
    expect(readFileSync('modules/jamvi-sms/android/src/main/AndroidManifest.xml', 'utf8')).toContain('android.permission.READ_SMS');
    const kotlin = readFileSync('modules/jamvi-sms/android/src/main/java/expo/modules/jamvisms/JamviSmsModule.kt', 'utf8');
    expect(kotlin).toContain('Name("JamviSms")');
    expect(kotlin).toContain('if (from !in wanted) continue');
    expect(readFileSync('modules/jamvi-sms/expo-module.config.json', 'utf8')).toContain('expo.modules.jamvisms.JamviSmsModule');
  });

  // The ignore rule once read "android/" at any depth, which kept the module's
  // Kotlin out of git and so out of the cloud build.
  it('keeps the module in git and the cloud build', () => {
    const ignore = readFileSync('.gitignore', 'utf8').split(/\r?\n/);
    expect(ignore).toContain('/android/');
    expect(ignore).not.toContain('android/');
  });

  // Asked for 2 Oct 2026: "add the notification when mpesa message arrives".
  it('tells the person when M-Pesa texts, only if they turned it on, opening the review', () => {
    const manifest = readFileSync('modules/jamvi-sms/android/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toContain('android.permission.RECEIVE_SMS');
    expect(manifest).toContain('android:permission="android.permission.BROADCAST_SMS"');
    expect(manifest).toContain('android.provider.Telephony.SMS_RECEIVED');
    const receiver = readFileSync('modules/jamvi-sms/android/src/main/java/expo/modules/jamvisms/MpesaSmsReceiver.kt', 'utf8');
    expect(receiver).toContain('if (!JamviSmsPrefs.notifyOn(context)) return');
    expect(receiver).toContain('if (sender !in JamviSmsPrefs.senders(context)) return');
    expect(receiver).toContain('mobile-budget://mpesa-import?fromSms=new');
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('{smsNotifiable ? (');
    expect(screen).toContain('Tell me when an M-Pesa message arrives, even when Jamvi is closed');
  });

  it('leaves SMS out of a Play Store build until Google approves it', () => {
    const config = readFileSync('app.config.js', 'utf8');
    expect(config).toContain("const playStore = process.env.JAMVI_PLAY_STORE === '1';");
    expect(config).toContain("'android.permission.READ_SMS', 'android.permission.RECEIVE_SMS'");
    const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
    expect(eas.build.play.android).toMatchObject({ buildType: 'app-bundle', env: { JAMVI_PLAY_STORE: '1' } });
    expect(eas.build.preview.android.env.JAMVI_PLAY_STORE).toBeUndefined();
  });

  // As for Share -> Jamvi (androidShare.test.ts): a new APK build, with the
  // update runtime left alone so phones on the old APK keep updating. The
  // module is loaded optionally, so the button simply never shows there.
  it('is a new APK build that leaves the update runtime alone', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
    expect(app.version).toBe('1.0.0');
    expect(app.android.versionCode).toBe(6);
    expect(readFileSync('lib/mpesaSms.ts', 'utf8')).toContain("requireOptionalNativeModule<NativeSms>('JamviSms')");
  });

  it('offers it in the import and on Home, and says so in the privacy policy', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('{smsReadable ? (');
    expect(screen).toContain('for (const batch of smsBatches(messages))');
    expect(screen).toContain("params.fromSms !== 'new'");
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain("router.push('/mpesa-import?fromSms=new' as never)");
    expect(readFileSync('../jamvi-website/src/pages/privacy.tsx', 'utf8')).toContain('M-Pesa messages and statements');
  });
});
