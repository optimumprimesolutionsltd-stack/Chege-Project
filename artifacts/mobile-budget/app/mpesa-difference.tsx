import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { formatDisplayDate } from '@/lib/displayFormat';
import { dayBefore } from '@/lib/bankPeriod';
import { readMpesaRows, smsRefusal } from '@/lib/mpesaSms';
import { retrySave } from '@/lib/saveRetry';
import { differenceError } from '@/lib/differenceError';
import { differenceMessages, fixConfirmation, fixPlan, hasFixes, inWorkingYear, kes, missingCharge, openingBalanceFix, statedCharge, receiptOf, spanChangeText, startingBalanceAdvice, workingYear, type DifferenceSpan } from '@/lib/mpesaLiveBalance';


type Span = DifferenceSpan;
type Answer = {
  account: { id: number; name: string; openingBalance: number };
  result: { from: string; to: string; checkedDays: number; startGap: number; endGap: number; spans: Span[]; moreSpans: number } | null;
};

/**
 * "Find the difference": why Jamvi's M-Pesa balance is not M-Pesa's.
 *
 * Each M-Pesa message states the balance after it. Day by day, that is laid
 * against the M-Pesa account in Jamvi (api-server lib/mpesa-difference.ts), and
 * every day the two part is listed with the entries that explain it: a payment
 * Jamvi does not have in this account, an entry no message has (typed by hand
 * or saved twice), or one saved under another day. Fixing those makes Jamvi's
 * own figure right - nothing here changes anything by itself.
 *
 * Only each message's code, balance and time go to the server; the messages
 * themselves stay on this phone and are shown from here.
 */
export default function MpesaDifferenceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'reading' | 'done' | 'error'>('reading');
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [bodies, setBodies] = useState<Map<string, string>>(new Map());
  // The charge each message states, the only one Fix all will add.
  const [statedCharges, setStatedCharges] = useState<Map<string, number>>(new Map());
  const chargeOf = (receipt: string) => statedCharges.get(receipt) ?? null;

  // Checking again over a result already shown keeps it on screen, with a
  // line saying so, rather than blanking it for a spinner each time.
  const shownRef = useRef(false);
  const [rechecking, setRechecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const check = useCallback(async () => {
    if (shownRef.current) setRechecking(true);
    else setState('reading');
    setError(null);
    try {
      // This year only, from 1 January.
      const { from: yearFrom, days } = workingYear();
      const read = await readMpesaRows(days);
      if (!read.ok) {
        setError(smsRefusal(read.reason));
        setState('error');
        return;
      }
      const rows = inWorkingYear(read.rows, yearFrom);
      const messages = differenceMessages(rows);
      if (messages.length === 0) {
        setError(`No M-Pesa messages with a balance are on this phone since 1 January ${workingYear().year}.`);
        setState('error');
        return;
      }
      const byReceipt = new Map<string, string>();
      // A Fuliza notice shares its payment's code: the charge comes from
      // whichever message with that code states one.
      const charges = new Map<string, number>();
      for (const row of rows) {
        const code = receiptOf(row.body);
        if (!code) continue;
        byReceipt.set(code, row.body.trim());
        const stated = statedCharge(row.body);
        if (stated !== null && !charges.has(code)) charges.set(code, stated);
      }
      setBodies(byReceipt);
      setStatedCharges(charges);
      // Only reads, so trying again through a server hiccup is always safe.
      setAnswer(await retrySave(() => customFetch<Answer>('/api/mpesa/difference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })));
      setState('done');
      setCheckedAt(Date.now());
      shownRef.current = true;
    } catch (reason) {
      setError(differenceError(reason));
      setState('error');
    } finally {
      setRechecking(false);
    }
  }, []);

  // Checked each time this screen is shown, not only the first: days brought
  // in or fixed from here ("Bring these days in", Bank) have to drop off the
  // list on the way back, or it goes on listing what is already sorted.
  useFocusEffect(useCallback(() => { void check(); }, [check]));

  // "Fix all": one confirmation, then everything that needs no judgement.
  const [fixing, setFixing] = useState(false);
  const fixAll = () => {
    if (!answer?.result) return;
    const plan = fixPlan(answer.result.spans, chargeOf);
    const { title, message } = fixConfirmation(plan, answer.account.name);
    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Fix all',
        onPress: async () => {
          setFixing(true);
          try {
            if (plan.move.length > 0 || plan.redate.length > 0 || plan.charges.length > 0) {
              await retrySave(() => customFetch('/api/mpesa/difference/fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ move: plan.move, redate: plan.redate, charges: plan.charges }),
              }));
            }
            if (plan.bringIn) {
              // Brought in and saved as Not sure yet by the import; coming back
              // here checks again.
              router.push(`/mpesa-import?smsFrom=${plan.bringIn.from}&smsTo=${plan.bringIn.to}&notSure=1` as never);
            } else {
              await check();
            }
          } catch (reason) {
            Alert.alert('Could not fix them', differenceError(reason));
          } finally {
            setFixing(false);
          }
        },
      },
    ]);
  };

  // The fixes "Fix all" leaves to judgement, each offered where it is shown.
  const [busyFix, setBusyFix] = useState<string | null>(null);
  const runFix = async (key: string, what: () => Promise<unknown>, failed: string) => {
    setBusyFix(key);
    try {
      await retrySave(what);
      await check();
    } catch (reason) {
      Alert.alert(failed, differenceError(reason));
    } finally {
      setBusyFix(null);
    }
  };
  /** The starting balance set to what closes the gap, dated the day before the messages begin. */
  const setOpening = (amount: number) => {
    if (!answer?.result) return;
    const { account: target, result: checked } = answer;
    Alert.alert(
      `Set the starting balance to ${kes(amount)}?`,
      `${target.name} held ${kes(amount)} before ${formatDisplayDate(checked.from)}, when your messages begin. Jamvi then starts level with M-Pesa. You can change it later in Bank.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Set it',
          onPress: () => void runFix('opening', () => customFetch('/api/joint-account/opening-balance', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: target.id, openingBalance: amount, openingBalanceDate: dayBefore(checked.from) }),
          }), 'Could not set the starting balance'),
        },
      ],
    );
  };
  /** An entry no message has: removed once the person says so. */
  const removeExtra = (item: { id: number; amount: number; description: string; date: string }) => {
    Alert.alert(
      'Remove this entry?',
      `${item.description}, ${item.amount < 0 ? '−' : '+'}${kes(Math.abs(item.amount))} on ${formatDisplayDate(item.date)}. No M-Pesa message has it, so it is most likely saved twice or not M-Pesa at all. Remove it only if so.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void runFix(`extra-${item.id}`, () => customFetch(`/api/joint-account/${item.id}`, { method: 'DELETE' }), 'Could not remove it'),
        },
      ],
    );
  };
  const openOnBank = (id: number) => {
    if (!answer) return;
    router.push(`/(tabs)/bank?editTx=${id}&accountId=${answer.account.id}&opened=${Date.now()}&returnTo=${encodeURIComponent('/mpesa-difference')}` as never);
  };

  const result = answer?.result ?? null;
  const account = answer?.account.name ?? 'M-Pesa';
  const advice = result && answer ? startingBalanceAdvice(result.startGap, answer.account.openingBalance, account, formatDisplayDate(result.from)) : null;
  const allAgree = result && result.spans.length === 0 && Math.abs(result.startGap) < 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="mpesa-difference-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Find the difference</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Your M-Pesa messages against {account} in Jamvi</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
        {state === 'reading' ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center' }}>
              Reading your M-Pesa messages since 1 January {workingYear().year} and checking each day…
            </Text>
          </View>
        ) : state === 'error' ? (
          <Pressable onPress={() => void check()} accessibilityRole="button" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-difference-error">
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Could not check</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{error} Tap to try again.</Text>
          </Pressable>
        ) : result ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-difference-summary">
              {rechecking ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} testID="mpesa-difference-rechecking">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Checking again with what you have saved since…</Text>
                </View>
              ) : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                Checked {result.checkedDays} days, {formatDisplayDate(result.from)} to {formatDisplayDate(result.to)}
              </Text>
              {allAgree ? (
                <Text style={{ color: colors.success, fontFamily: 'Inter_700Bold', fontSize: 16 }} testID="mpesa-difference-agree">
                  Jamvi matches M-Pesa on every one of those days.
                </Text>
              ) : (
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
                  {Math.abs(result.endGap) < 1
                    ? 'Jamvi ends level with M-Pesa, but parts from it along the way.'
                    : `Today Jamvi is ${kes(Math.abs(result.endGap))} ${result.endGap > 0 ? 'below' : 'above'} M-Pesa.`}
                </Text>
              )}
              {!allAgree ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {result.spans.length > 0
                    ? `It comes from ${result.spans.length + result.moreSpans === 1 ? 'one place' : `${result.spans.length + result.moreSpans} places`} below. Fix each, and Jamvi's own figure comes right.`
                    : 'Every day after the first agrees, so it is the starting balance.'}
                </Text>
              ) : null}
            </View>

            {result.spans.length > 0 && hasFixes(fixPlan(result.spans, chargeOf)) ? (
              <Pressable
                onPress={fixAll}
                disabled={fixing || rechecking}
                accessibilityRole="button"
                testID="mpesa-difference-fix-all"
                style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', opacity: fixing || rechecking ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{fixing ? 'Fixing…' : 'Fix all of these'}</Text>
                <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                  You see exactly what changes first. Nothing is deleted.
                </Text>
              </Pressable>
            ) : null}

            {advice ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: '#F59E0B' }]} testID="mpesa-difference-start">
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Before your messages begin</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{advice}</Text>
                {(() => {
                  const amount = answer ? openingBalanceFix(result.startGap, answer.account.openingBalance) : null;
                  return amount !== null ? (
                    <Pressable
                      onPress={() => setOpening(amount)}
                      disabled={busyFix !== null || rechecking}
                      accessibilityRole="button"
                      testID="mpesa-difference-set-opening"
                      style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: 'center', opacity: busyFix === 'opening' ? 0.6 : 1 }}
                    >
                      <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>{busyFix === 'opening' ? 'Setting…' : `Set it to ${kes(amount)}`}</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => router.push('/(tabs)/bank' as never)} accessibilityRole="button" style={[styles.action, { borderColor: colors.primary }]}>
                      <Text style={[styles.actionText, { color: colors.primary }]}>Open Bank</Text>
                    </Pressable>
                  );
                })()}
              </View>
            ) : null}

            {result.spans.map((span) => (
              <View key={`${span.from}-${span.to}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`mpesa-difference-span-${span.to}`}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {span.from === span.to ? formatDisplayDate(span.to) : `${formatDisplayDate(span.from)} – ${formatDisplayDate(span.to)}`}
                </Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold' }}>{spanChangeText(span.change)}</Text>

                {span.missing.length > 0 ? (
                  <View style={styles.group}>
                    <Text style={[styles.groupTitle, { color: colors.foreground }]}>In M-Pesa, not in {account}</Text>
                    {span.missing.map((item) => (
                      <View key={item.receipt} style={[styles.item, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={3}>{bodies.get(item.receipt) ?? item.receipt}</Text>
                        <Text style={{ color: item.savedIn ? '#B45309' : colors.mutedForeground, fontSize: 12 }}>
                          {item.savedIn
                            ? `Saved in ${item.savedIn} instead${item.savedOn ? ` (${formatDisplayDate(item.savedOn)})` : ''}: move it to ${account} in Bank.`
                            : 'Not saved anywhere yet.'}
                        </Text>
                      </View>
                    ))}
                    {span.missing.some((item) => !item.savedIn) ? (
                      <Pressable
                        onPress={() => router.push(`/mpesa-import?smsFrom=${span.from}&smsTo=${span.to}` as never)}
                        accessibilityRole="button"
                        style={[styles.action, { borderColor: colors.primary }]}
                        testID={`mpesa-difference-bring-${span.to}`}
                      >
                        <Text style={[styles.actionText, { color: colors.primary }]}>Bring these days in</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {span.extra.length > 0 ? (
                  <View style={styles.group}>
                    <Text style={[styles.groupTitle, { color: colors.foreground }]}>In {account}, in none of your messages</Text>
                    {span.extra.map((item) => (
                      <View key={item.id} style={[styles.item, { borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                          <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }} numberOfLines={2}>{item.description}</Text>
                          <Text style={{ color: item.amount < 0 ? colors.destructive : colors.success, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                            {item.amount < 0 ? '−' : '+'}{kes(Math.abs(item.amount))}
                          </Text>
                        </View>
                        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                          {formatDisplayDate(item.date)} · {item.receipt ? `code ${item.receipt}, not among your messages` : 'typed by hand'}: saved twice, or not M-Pesa?
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                          <Pressable onPress={() => openOnBank(item.id)} accessibilityRole="button" testID={`mpesa-difference-open-${item.id}`} style={[styles.action, { borderColor: colors.border, flex: 1 }]}>
                            <Text style={[styles.actionText, { color: colors.foreground }]}>Open</Text>
                          </Pressable>
                          <Pressable onPress={() => removeExtra(item)} disabled={busyFix !== null || rechecking} accessibilityRole="button" testID={`mpesa-difference-remove-${item.id}`} style={[styles.action, { borderColor: colors.destructive, flex: 1, opacity: busyFix === `extra-${item.id}` ? 0.6 : 1 }]}>
                            <Text style={[styles.actionText, { color: colors.destructive }]}>{busyFix === `extra-${item.id}` ? 'Removing…' : 'Remove'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {span.redated.length > 0 ? (
                  <View style={styles.group}>
                    <Text style={[styles.groupTitle, { color: colors.foreground }]}>Saved under a different day</Text>
                    {span.redated.map((item) => (
                      <View key={item.id} style={[styles.item, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={2}>
                          {item.description} · {item.amount < 0 ? '−' : '+'}{kes(Math.abs(item.amount))}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                          M-Pesa {formatDisplayDate(item.messageDay)}, saved {formatDisplayDate(item.savedDate)}. Only the day differs, so this evens out.
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {(span.amounts ?? []).length > 0 ? (
                  <View style={styles.group}>
                    <Text style={[styles.groupTitle, { color: colors.foreground }]}>Saved for a different amount</Text>
                    {(span.amounts ?? []).map((item) => {
                      const charge = missingCharge(item, chargeOf(item.receipt));
                      return (
                        <View key={item.receipt} style={[styles.item, { borderColor: colors.border }]}>
                          <Text style={{ color: colors.foreground, fontSize: 13 }} numberOfLines={2}>{item.description} · {formatDisplayDate(item.day)}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                            {charge !== null
                              ? `M-Pesa took ${kes(Math.abs(item.inMessages))}, Jamvi has ${kes(Math.abs(item.inJamvi))}: a ${kes(charge)} M-Pesa charge never saved. Fix all adds it.`
                              : `M-Pesa: ${item.inMessages < 0 ? '−' : '+'}${kes(Math.abs(item.inMessages))}, Jamvi: ${item.inJamvi < 0 ? '−' : '+'}${kes(Math.abs(item.inJamvi))}. Check its amount in Bank.`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {span.missing.length + span.extra.length + span.redated.length + (span.amounts ?? []).length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    No single entry explains this: often an M-Pesa charge or Fuliza that was not saved. Bring these days in to see them.
                  </Text>
                ) : null}

                {span.extra.length > 0 || span.redated.length > 0 ? (
                  <Pressable onPress={() => router.push('/(tabs)/bank' as never)} accessibilityRole="button" style={[styles.action, { borderColor: colors.border }]}>
                    <Text style={[styles.actionText, { color: colors.foreground }]}>Open Bank</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}

            {result.moreSpans > 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }}>
                And {result.moreSpans} more. Fix these first, then check again.
              </Text>
            ) : null}

            {/* Its own "checking" and "checked at", here at the bottom where it was
                tapped: the notice at the top was out of sight, and the same
                result again looked like nothing happened (5 Oct 2026). */}
            <Pressable onPress={() => void check()} disabled={rechecking} accessibilityRole="button" style={[styles.action, { alignSelf: 'center', borderColor: colors.primary, opacity: rechecking ? 0.6 : 1 }]} testID="mpesa-difference-again">
              <Text style={[styles.actionText, { color: colors.primary }]}>{rechecking ? 'Checking…' : 'Check again'}</Text>
            </Pressable>
            {checkedAt && !rechecking ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }} testID="mpesa-difference-checked-at">
                Checked at {new Date(checkedAt).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  body: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 8 },
  group: { gap: 6, marginTop: 4 },
  groupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, gap: 2 },
  action: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  actionText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});
