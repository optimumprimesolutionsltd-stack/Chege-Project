import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Reading M-Pesa's own text messages straight from the phone, on request
 * (modules/jamvi-sms). Android only, and only in a build that carries the
 * permission: an older APK, a Play Store build (which has it removed until
 * Google approves it), iPhone and web all get null and never show the button.
 *
 * Only M-Pesa's sender, only between the dates chosen, only when the person
 * taps. The messages go through the same reader as pasted ones (sent to the
 * server to be read, never stored): only the entries the person saves are kept.
 */

type NativeSms = {
  isAvailable(): boolean;
  readMessages(senders: string[], fromMs: number, toMs: number, limit: number): Promise<Array<{ address: string; body: string; date: number }>>;
  // From versionCode 6: the notification when M-Pesa texts (MpesaSmsReceiver).
  canNotify?(): boolean;
  setNotify?(on: boolean, senders: string[]): void;
  notifyOn?(): boolean;
};

const native: NativeSms | null = Platform.OS === 'android' ? requireOptionalNativeModule<NativeSms>('JamviSms') : null;

/** M-Pesa's sender, as the native side matches it: capitals, letters and digits only. Fuliza writes from the same. */
export const MPESA_SENDERS = ['MPESA'];

/** The most messages read at once: a busy year is a few thousand. */
export const MAX_SMS = 5_000;

/** Messages per request to the reader; it takes 200 at most, and 100,000 characters. */
export const SMS_BATCH = 150;

export function canReadSms(): boolean {
  try {
    return native?.isAvailable() === true;
  } catch {
    return false;
  }
}

export type SmsResult =
  | { ok: true; messages: string[] }
  | { ok: false; reason: 'denied' | 'blocked' | 'unavailable' };

/** Midnight at the start of `iso` ("2026-01-01"), on this phone's clock. */
const startOf = (iso: string): number => new Date(`${iso}T00:00:00`).getTime();

/**
 * M-Pesa's messages from `from` to `to` (both days included), oldest first,
 * asking Android's permission the first time.
 */
export async function readMpesaSms(from: string, to: string): Promise<SmsResult> {
  if (!native || !canReadSms()) return { ok: false, reason: 'unavailable' };
  const permission = PermissionsAndroid.PERMISSIONS.READ_SMS;
  if (!(await PermissionsAndroid.check(permission))) {
    const answer = await PermissionsAndroid.request(permission, {
      title: 'Read your M-Pesa messages?',
      message: 'Jamvi reads only M-Pesa’s messages, only for the dates you choose, and only when you ask. They are read into a list for you to review and are not kept; only the entries you save are stored.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    if (answer === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return { ok: false, reason: 'blocked' };
    if (answer !== PermissionsAndroid.RESULTS.GRANTED) return { ok: false, reason: 'denied' };
  }
  const [start, end] = from <= to ? [from, to] : [to, from];
  const rows = await native.readMessages(MPESA_SENDERS, startOf(start), startOf(end) + 86_400_000, MAX_SMS);
  return { ok: true, messages: smsBodies(rows) };
}

/** The messages' text, oldest first, empty ones left out. */
export function smsBodies(rows: ReadonlyArray<{ body: string; date: number }>): string[] {
  return [...rows].sort((a, b) => a.date - b.date).map((row) => row.body.trim()).filter(Boolean);
}

/** The messages split into requests the reader will take. */
export function smsBatches(messages: readonly string[], size = SMS_BATCH, maxChars = 90_000): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const message of messages) {
    if (current.length > 0 && (current.length >= size || chars + message.length + 2 > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(message);
    chars += message.length + 2;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** What to say when there is nothing to read. */
export function smsRefusal(reason: 'denied' | 'blocked' | 'unavailable'): string {
  if (reason === 'blocked') return 'Android is set not to let Jamvi read messages. Allow it under Settings > Apps > Jamvi > Permissions > SMS, or paste them instead.';
  if (reason === 'denied') return 'Jamvi was not allowed to read your messages. You can paste them instead, or try again and tap Allow.';
  return 'Reading messages needs the newest Jamvi app. Paste them instead for now.';
}

/**
 * Checking for new M-Pesa messages each time Jamvi opens - "every time M-Pesa
 * is used, the app should read it". On only after the person allowed it, and
 * only messages since Jamvi last took them in, so Home can say "3 new M-Pesa
 * messages". Nothing is saved without the person's review.
 *
 * Kept on this phone, per person: the messages are this phone's.
 */
export type SmsAuto = { on: boolean; since: number };

export const smsAutoKey = (userId: string | undefined): string => `jamvi:sms-auto:${userId ?? 'none'}`;

export function parseSmsAuto(raw: string | null | undefined): SmsAuto {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<SmsAuto>) : null;
    if (parsed && typeof parsed.on === 'boolean' && typeof parsed.since === 'number') return { on: parsed.on, since: parsed.since };
  } catch {
    // Damaged: start again, off.
  }
  return { on: false, since: 0 };
}

/**
 * M-Pesa's messages since `since` (milliseconds), oldest first, without asking:
 * null when this build cannot, or Android has not been allowed. For the quiet
 * check when Jamvi opens.
 */
export async function newMpesaSms(since: number, now = Date.now()): Promise<{ messages: string[]; newest: number } | null> {
  if (!native || !canReadSms()) return null;
  if (!(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS))) return null;
  const rows = await native.readMessages(MPESA_SENDERS, since + 1, now + 1, MAX_SMS);
  return { messages: smsBodies(rows), newest: rows.reduce((max, row) => Math.max(max, row.date), since) };
}

/**
 * "Tell me when an M-Pesa message arrives": a notification from Android the
 * moment M-Pesa texts, even with Jamvi closed; tapping it opens the new ones
 * in the import (mobile-budget://mpesa-import?fromSms=new). Only builds that
 * carry the receiver and RECEIVE_SMS offer it.
 */
export function canNotifySms(): boolean {
  try {
    return canReadSms() && typeof native?.canNotify === 'function' && native.canNotify() === true;
  } catch {
    return false;
  }
}

export function smsNotifyOn(): boolean {
  try {
    return native?.notifyOn?.() === true;
  } catch {
    return false;
  }
}

/** Turns the notification on (asking Android first) or off. Says whether it ended up on. */
export async function setSmsNotify(on: boolean): Promise<{ on: boolean; reason?: 'denied' | 'blocked' }> {
  if (!native?.setNotify || !canNotifySms()) return { on: false };
  if (on) {
    const wanted = [PermissionsAndroid.PERMISSIONS.READ_SMS, PermissionsAndroid.PERMISSIONS.RECEIVE_SMS];
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    const answers = await PermissionsAndroid.requestMultiple(wanted);
    const values = Object.values(answers);
    if (values.some((answer) => answer === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return { on: false, reason: 'blocked' };
    if (values.some((answer) => answer !== PermissionsAndroid.RESULTS.GRANTED)) return { on: false, reason: 'denied' };
  }
  native.setNotify(on, MPESA_SENDERS);
  return { on };
}

/** "3 new M-Pesa messages" - for Home. */
export const newSmsTitle = (count: number): string => `${count} new M-Pesa ${count === 1 ? 'message' : 'messages'}`;
