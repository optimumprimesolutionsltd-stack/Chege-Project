import { Alert } from 'react-native';
import { customFetch } from '@workspace/api-client-react';
import { alreadyFromMpesaMessage } from './mpesaImport';

type Found = { description: string; date: string; amount: number; receipt?: string | null };

/**
 * Before a payment typed by hand is saved: does Jamvi already have it from
 * M-Pesa? Same amount, the same way, within a day either side (api-server
 * lib/possible-duplicates). If so the person is asked, and nothing is saved
 * unless they say it is a different payment. A failed check never stops a save.
 * Asked for 5 Oct 2026: "a warning when something that the app has picked is
 * picked again". The web does the same (family-budget lib/already-from-mpesa).
 */
export async function confirmNotAlreadyFromMpesa(item: { amount: number; date: string; direction: 'in' | 'out'; accountId?: number | null }): Promise<boolean> {
  let entries: Found[] = [];
  try {
    const body = await customFetch<{ matches: Array<{ key: string; entries: Found[] }> }>('/api/possible-duplicates/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ against: 'imported', items: [{ key: 'typed', amount: item.amount, date: item.date, direction: item.direction, ...(item.accountId ? { accountId: item.accountId } : {}) }] }),
    });
    entries = body.matches[0]?.entries ?? [];
  } catch {
    return true;
  }
  if (entries.length === 0) return true;
  const { title, message } = alreadyFromMpesaMessage(entries);
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Don't save", style: 'cancel', onPress: () => resolve(false) },
        { text: 'Save anyway', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
