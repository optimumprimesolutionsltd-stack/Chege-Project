/**
 * An account statement for a period.
 *
 * The Banking tab lists newest first, which is right for entering a day and
 * useless for checking one: a running balance only means anything read
 * downwards from where it started. So this is oldest first, opening balance at
 * the top, closing balance at the bottom — the document you hold beside the
 * bank's own to find the line where the two stopped agreeing.
 *
 * Reconciling already tells you *that* the two disagree, and by how much. This
 * is how you find *where*.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { customFetch, useGetGroup, useGetJointAccounts } from '@workspace/api-client-react';
import { shareStatementPdf } from '@/lib/shareStatementPdf';

type Account = { id: number; name: string };

type StatementEntry = {
  id: number;
  date: string;
  description: string;
  detail: string | null;
  moneyIn: number;
  moneyOut: number;
  balance: number;
};

type Statement = {
  accountId: number;
  accountName: string;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  borrowed: number;
  repaidToUs: number;
  lent: number;
  entries: StatementEntry[];
};

function formatKES(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The month somebody is most likely to want, which is the one just gone. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(first), to: iso(now) };
}

export default function BankStatementScreen() {
  const colors = useColors();
  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Account[];

  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

  const activeAccountId = accountId ?? accounts[0]?.id ?? null;

  const { data: statement, isLoading, isError, refetch } = useQuery<Statement>({
    queryKey: ['bank-statement', activeAccountId, from, to],
    queryFn: () =>
      customFetch<Statement>(`/api/joint-account/statement?accountId=${activeAccountId}&from=${from}&to=${to}`),
    enabled: activeAccountId !== null && from <= to,
  });

  // Owners and admins only: a PDF is a copy that can be forwarded, and the
  // server refuses everybody else.
  const { data: group } = useGetGroup();
  const canDownloadPdf = group?.isPrivate !== false || group?.role === 'owner' || group?.role === 'admin';

  const share = async () => {
    if (activeAccountId === null) return;
    setSharing(true);
    try {
      await shareStatementPdf({ accountId: activeAccountId, from, to, accountName: statement?.accountName ?? 'account' });
    } catch (error: unknown) {
      Alert.alert('Could not share the statement', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <PageScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} testID="statement-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Account statement</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Oldest first, with a running balance, so it can be read alongside the bank's own.
      </Text>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Account</Text>
      <View style={{ gap: 8 }}>
        {accounts.map((candidate) => (
          <TouchableOpacity
            key={candidate.id}
            onPress={() => setAccountId(candidate.id)}
            testID={`statement-account-${candidate.id}`}
            style={[
              styles.field,
              {
                borderColor: activeAccountId === candidate.id ? colors.primary : colors.border,
                backgroundColor: activeAccountId === candidate.id ? `${colors.primary}18` : colors.card,
              },
            ]}
          >
            <Text style={{ color: colors.foreground }}>{candidate.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.rangeRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>From</Text>
          <Pressable onPress={() => setPicking('from')} testID="statement-from" style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Text style={{ color: colors.foreground }}>{from}</Text>
            <Feather name="calendar" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>To</Text>
          <Pressable onPress={() => setPicking('to')} testID="statement-to" style={[styles.field, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Text style={{ color: colors.foreground }}>{to}</Text>
            <Feather name="calendar" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
      {picking && (
        <DateTimePicker
          value={new Date(picking === 'from' ? from : to)}
          mode="date"
          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
            const which = picking;
            setPicking(null);
            if (!selected || !which) return;
            if (which === 'from') setFrom(iso(selected));
            else setTo(iso(selected));
          }}
        />
      )}
      {from > to ? (
        <Text style={{ color: '#f87171', fontSize: 12, marginTop: 8 }} testID="statement-bad-range">
          The period ends before it starts.
        </Text>
      ) : null}

      {isLoading ? <ActivityIndicator style={{ marginTop: 28 }} color={colors.primary} /> : null}
      {isError ? (
        <Pressable onPress={() => void refetch()} style={{ marginTop: 24 }} testID="statement-retry">
          <Text style={{ color: colors.primary }}>That did not load. Tap to try again.</Text>
        </Pressable>
      ) : null}

      {statement ? (
        <>
          <View style={[styles.balanceCard, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]} testID="statement-balances">
            <View style={styles.balanceRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Opening balance</Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>KES {formatKES(statement.openingBalance)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Money in</Text>
              <Text style={{ color: '#22c55e', fontFamily: 'Inter_600SemiBold' }}>KES {formatKES(statement.totalIn)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Money out</Text>
              <Text style={{ color: '#f87171', fontFamily: 'Inter_600SemiBold' }}>KES {formatKES(statement.totalOut)}</Text>
            </View>
            <View style={[styles.balanceRow, { marginTop: 4 }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold' }}>Closing balance</Text>
              <Text testID="statement-closing" style={{ color: statement.closingBalance < 0 ? '#f87171' : colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>
                KES {formatKES(statement.closingBalance)}
              </Text>
            </View>
          </View>

          {statement.borrowed > 0 || statement.repaidToUs > 0 || statement.lent > 0 ? (
            <View style={[styles.noteCard, { borderColor: colors.border, backgroundColor: colors.card }]} testID="statement-movement">
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                OF WHICH, NEITHER EARNED NOR SPENT
              </Text>
              {statement.borrowed > 0 ? <Text style={{ color: colors.foreground, marginTop: 4 }}>Borrowed: KES {formatKES(statement.borrowed)}</Text> : null}
              {statement.repaidToUs > 0 ? <Text style={{ color: colors.foreground, marginTop: 2 }}>Paid back to you: KES {formatKES(statement.repaidToUs)}</Text> : null}
              {statement.lent > 0 ? <Text style={{ color: colors.foreground, marginTop: 2 }}>Lent out: KES {formatKES(statement.lent)}</Text> : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6, lineHeight: 16 }}>
                Inside the totals above, because it really did move the balance.
              </Text>
            </View>
          ) : null}

          {canDownloadPdf ? (
          <TouchableOpacity
            onPress={() => void share()}
            disabled={sharing}
            testID="statement-share"
            style={[styles.share, { backgroundColor: colors.primary, opacity: sharing ? 0.6 : 1 }]}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="share-2" size={16} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }}>Share as PDF</Text>
              </>
            )}
          </TouchableOpacity>
          ) : null}

          {statement.entries.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, marginTop: 24, fontSize: 13 }} testID="statement-empty">
              Nothing was recorded against this account in that period.
            </Text>
          ) : (
            <View style={{ marginTop: 20 }}>
              {statement.entries.map((entry) => (
                <View key={entry.id} testID={`statement-row-${entry.id}`} style={[styles.entry, { borderColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.foreground }} numberOfLines={1}>{entry.description}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                      {entry.date}{entry.detail ? ` · ${entry.detail}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: entry.moneyIn > 0 ? '#22c55e' : '#f87171', fontFamily: 'Inter_600SemiBold' }}>
                      {entry.moneyIn > 0 ? '+' : '−'}{formatKES(entry.moneyIn > 0 ? entry.moneyIn : entry.moneyOut)}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{formatKES(entry.balance)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </PageScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46 },
  rangeRow: { flexDirection: 'row', gap: 10 },
  balanceCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 20, gap: 6 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, height: 48, marginTop: 16 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
});
