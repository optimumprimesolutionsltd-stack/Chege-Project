import AsyncStorage from '@react-native-async-storage/async-storage';
import { getImportProgress } from '@/lib/importProgress';

/**
 * Why the app last signed somebody out, kept on the phone and shown on the
 * sign-in screen.
 *
 * People were signed out in the middle of a statement import with nothing to
 * say why, and no crash report reaches us from a phone. Each place that ends a
 * session now says which it was, so the next screenshot of the sign-in screen
 * names the cause instead of leaving it to be guessed.
 */

export type SignOutReason =
  | 'you-signed-out'
  | 'server-said-401'
  | 'server-has-no-user'
  | 'request-401-confirmed'
  | 'no-token-on-phone';

const KEY = 'jamvi:last-sign-out';

export type SignOutRecord = { reason: SignOutReason; at: number; importing: string | null };

export async function recordSignOut(reason: SignOutReason): Promise<void> {
  const progress = getImportProgress();
  const importing = progress?.stage === 'saving' ? `while saving an import (${progress.done} of ${progress.total})` : null;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ reason, at: Date.now(), importing } satisfies SignOutRecord));
  } catch {
    // Only a note; never a reason to fail signing out.
  }
}

export async function readLastSignOut(): Promise<SignOutRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as SignOutRecord;
    return typeof record?.reason === 'string' && typeof record.at === 'number' ? record : null;
  } catch {
    return null;
  }
}

export async function clearLastSignOut(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/** The plain words for a reason, as the sign-in screen shows them. */
export function describeSignOut(record: SignOutRecord): string {
  const time = new Date(record.at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
  const day = new Date(record.at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  const why: Record<SignOutReason, string> = {
    'you-signed-out': 'you signed out',
    'server-said-401': 'Jamvi did not recognise this sign-in when the app opened',
    'server-has-no-user': 'the sign-in had no account behind it when the app opened',
    'request-401-confirmed': 'Jamvi no longer recognised this sign-in',
    'no-token-on-phone': 'the phone had no saved sign-in when the app opened',
  };
  return `Signed out ${day} at ${time}: ${why[record.reason]}${record.importing ? `, ${record.importing}` : ''}.`;
}
