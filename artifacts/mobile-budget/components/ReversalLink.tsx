import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetReversalQueryKey,
  useGetReversal,
  useLinkReversal,
  useUnlinkReversal,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Pairing = {
  role: 'money_back' | 'reversed_payment';
  otherTransactionId: number;
  otherDescription: string;
  otherDate: string;
};

type Props = {
  transaction: { id: number; type: string; amount: number; description?: string | null; reversal?: Pairing | null };
  /** Owners and admins only: the server refuses anybody else. */
  canManage: boolean;
  /** Refresh every balance and total the link changes. */
  onChanged: () => void;
};

const kes = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 2 });

function day(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Link a money-back deposit to the payment it reversed, or undo the link.
 *
 * An M-Pesa reversal is a payment that did not go through coming back. Left
 * alone it read as income while the payment it undid still read as spending.
 * Linked, neither counts, and the balance is untouched. Only a payment of
 * exactly the same amount, dated on or up to 60 days before, is offered: if
 * none is, this is not a reversal of anything recorded here.
 *
 * On the payment's side there is nothing to choose, only a note saying it was
 * reversed and where to undo that.
 */
export function ReversalLink({ transaction, canManage, onChanged }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const isDeposit = transaction.type === 'deposit';
  const { data, isLoading } = useGetReversal(transaction.id, {
    query: { queryKey: getGetReversalQueryKey(transaction.id), enabled: isDeposit && canManage },
  });
  const { mutateAsync: link } = useLinkReversal();
  const { mutateAsync: unlink } = useUnlinkReversal();
  const [busy, setBusy] = useState<number | 'unlink' | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetReversalQueryKey(transaction.id) });
    onChanged();
  };

  // The payment's side: say it was reversed, and where to undo it.
  if (!isDeposit) {
    if (transaction.reversal?.role !== 'reversed_payment') return null;
    return (
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 4, marginTop: 8 }} testID="reversal-payment-note">
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>This payment was reversed</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
          The money came back on {day(transaction.reversal.otherDate)} ({transaction.reversal.otherDescription}), so neither counts as
          spending or income. To edit or delete this payment, open that money back and unlink it first.
        </Text>
      </View>
    );
  }

  if (!canManage || isLoading || !data?.available) return null;

  const doLink = async (originalId: number) => {
    setBusy(originalId);
    try {
      await link({ id: transaction.id, data: { originalTransactionId: originalId } });
      await refresh();
    } catch (error: unknown) {
      Alert.alert('Could not link it', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const doUnlink = () => {
    Alert.alert(
      'Unlink this reversal?',
      'The money back will count as income again, and the payment as spending, with its category back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setBusy('unlink');
            try {
              await unlink({ id: transaction.id });
              await refresh();
            } catch (error: unknown) {
              Alert.alert('Could not unlink it', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  if (data.linked) {
    const original = data.linked;
    return (
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 6, marginTop: 8 }} testID="reversal-linked">
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Money back from a reversed payment</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
          Reverses {original.description} of KES {kes(original.amount)} on {day(original.date)}
          {original.expenseCategory ? ` (was under ${original.expenseCategory})` : ''}. Neither counts as income or spending.
          Unlink it to edit or delete either entry.
        </Text>
        <Pressable onPress={doUnlink} disabled={busy !== null} accessibilityRole="button" testID="reversal-unlink" hitSlop={6}>
          {busy === 'unlink'
            ? <ActivityIndicator color={colors.primary} />
            : <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold' }}>Unlink</Text>}
        </Pressable>
      </View>
    );
  }

  // Offered only when a payment could be what came back, or the entry already
  // says it is money back - otherwise every deposit would ask the question.
  const saysMoneyBack = /money back|revers/i.test(transaction.description ?? '');
  if (data.candidates.length === 0 && !saysMoneyBack) return null;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 8, marginTop: 8 }} testID="reversal-candidates">
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Is this money back from a payment that did not go through?</Text>
      {data.candidates.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }} testID="reversal-none">
          No payment of KES {kes(transaction.amount)} was recorded in the 60 days before this, so there is nothing to link it to.
        </Text>
      ) : (
        <>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
            Pick the payment it reversed. Then neither counts as income or spending.
          </Text>
          {data.candidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              onPress={() => doLink(candidate.id)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`Link to ${candidate.description}, ${kes(candidate.amount)} shillings on ${day(candidate.date)}`}
              testID={`reversal-candidate-${candidate.id}`}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 6,
                backgroundColor: pressed ? colors.muted : 'transparent', borderWidth: 1, borderColor: colors.border,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{candidate.description}</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }} numberOfLines={1}>
                  {day(candidate.date)}{candidate.expenseCategory ? ` · ${candidate.expenseCategory}` : ''}{candidate.accountName ? ` · ${candidate.accountName}` : ''}
                </Text>
              </View>
              {busy === candidate.id
                ? <ActivityIndicator color={colors.primary} />
                : <Feather name="link" size={16} color={colors.primary} />}
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}
