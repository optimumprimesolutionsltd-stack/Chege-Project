import { Alert } from 'react-native';
import { customFetch } from '@workspace/api-client-react';
import { alreadyFromMpesaMessage } from './mpesaImport';

type Found = { description: string; date: string; amount: number; receipt?: string | null };

/** One side of what is being typed: money in or out of an account, or into or out of a savings goal. */
export type TypedSide = { amount: number; date: string; direction: 'in' | 'out'; accountId?: number | null; goalId?: number | null };

/**
 * Before a payment or a move typed by hand is saved: does Jamvi already have it
 * from M-Pesa? Same amount, the same way, within a day either side, and for a
 * savings move the same goal (api-server lib/possible-duplicates). A transfer
 * between accounts is checked on both sides. If anything matches the person is
 * asked, and nothing is saved unless they say it is a different payment. A
 * failed check never stops a save. Asked for 5 Oct 2026: "a warning when
 * something that the app has picked is picked again". The web does the same
 * (family-budget lib/already-from-mpesa).
 */
export async function confirmNotAlreadyFromMpesa(sides: TypedSide | readonly TypedSide[]): Promise<boolean> {
  const list = Array.isArray(sides) ? sides : [sides as TypedSide];
  let entries: Found[] = [];
  try {
    const body = await customFetch<{ matches: Array<{ key: string; entries: Found[] }> }>('/api/possible-duplicates/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        against: 'imported',
        items: list.map((side, n) => ({
          key: `typed-${n}`,
          amount: side.amount,
          date: side.date,
          direction: side.direction,
          ...(side.accountId ? { accountId: side.accountId } : {}),
          ...(side.goalId ? { goalId: side.goalId } : {}),
        })),
      }),
    });
    entries = body.matches.flatMap((match) => match.entries);
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
