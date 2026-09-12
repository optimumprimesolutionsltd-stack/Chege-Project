import { Alert } from 'react-native';
import { router } from 'expo-router';

/**
 * The server returns 402 with a read-only message when a lapsed member tries
 * to record — in their own Personal budget or a Shared group alike. Turn
 * that into a clear prompt with a way to fix it, rather than a generic
 * "could not save".
 *
 * Returns true when it handled the error (the caller should stop), false
 * otherwise (the caller shows its own message).
 */
export function handleLapsedError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status !== 402) return false;

  const message =
    (error as { data?: { error?: string } } | null)?.data?.error ??
    'This is read-only because your Jamvi subscription has lapsed. Nothing has been removed.';

  Alert.alert('Subscription needed', message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Subscribe', onPress: () => router.push('/subscription') },
  ]);
  return true;
}
