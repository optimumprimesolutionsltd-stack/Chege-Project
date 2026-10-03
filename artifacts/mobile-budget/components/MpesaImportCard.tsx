import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useColors } from '@/hooks/useColors';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { mpesaCardKey, rememberMpesaCard, shouldShowMpesaCard } from '@/lib/mpesaCard';

/**
 * Your M-Pesa, first thing on Home and always there.
 *
 * M-Pesa is what people open Jamvi for, so Home leads with it: what came in
 * and went out through M-Pesa this month, when it was last brought in, and one
 * tap to bring more in. Before the first import it carries the short
 * explanation instead of figures; "Not now" folds that explanation away but
 * leaves the panel and its button in place.
 */

interface MpesaSummary {
  month: number;
  year: number;
  imported: boolean;
  latestDate: string | null;
  entries: number;
  moneyIn: number;
  moneyOut: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

// The mat's woven edge, as on the website and the web app.
const WEAVE = ['#E9B949', '#14776A', '#14776A', '#D9663B', '#0D4A43', '#0D4A43'];

export function MpesaImportCard() {
  const colors = useColors();
  const [introOpen, setIntroOpen] = useState(false);
  // Remembered for each workspace: used in a shared group, it still shows on Personal.
  const { data: group } = useGetGroup();
  const groupId = group?.id ?? null;
  const canImport = group?.role !== 'viewer';

  useEffect(() => {
    if (groupId === null) return undefined;
    let alive = true;
    AsyncStorage.getItem(mpesaCardKey(groupId))
      .then((stored) => alive && setIntroOpen(shouldShowMpesaCard(stored)))
      .catch(() => alive && setIntroOpen(true));
    return () => {
      alive = false;
    };
  }, [groupId]);

  const { data: summary } = useQuery({
    queryKey: ['mpesa-summary', groupId],
    queryFn: () => customFetch<MpesaSummary>('/api/mpesa/summary'),
    enabled: groupId !== null,
    staleTime: 60_000,
    retry: false,
  });

  const monthName = MONTHS[(summary?.month ?? new Date().getMonth() + 1) - 1];
  const showIntro = introOpen && !summary?.imported;
  const figures = [
    { label: 'Came in', value: summary ? kes(summary.moneyIn) : '…' },
    { label: 'Went out', value: summary ? kes(summary.moneyOut) : '…' },
    { label: 'Entries', value: summary ? String(summary.entries) : '…' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.foreground }]} testID="mpesa-home-card">
      <View style={styles.weave}>
        {Array.from({ length: 18 }, (_, i) => (
          <View key={i} style={{ flex: i % 3 === 2 ? 0.5 : 1, backgroundColor: WEAVE[i % WEAVE.length] }} />
        ))}
      </View>
      <View style={styles.inner}>
        <View style={styles.headRow}>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR M-PESA · {monthName.toUpperCase()}</Text>
          {summary?.latestDate ? (
            <Text style={[styles.latest, { color: colors.mutedForeground }]}>Latest {shortDate(summary.latestDate)}</Text>
          ) : null}
        </View>

        {showIntro ? (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Your M-Pesa month, sorted in minutes</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Import your M-Pesa statement or paste your messages, and Jamvi fills in what you spent, on what and who paid you.
              A statement is read on this phone and never uploaded.
            </Text>
          </>
        ) : (
          <View style={[styles.figures, { borderTopColor: colors.border }]}>
            {figures.map((figure) => (
              <View key={figure.label} style={styles.figure}>
                <Text style={[styles.figureLabel, { color: colors.mutedForeground }]}>{figure.label}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.figureValue, { color: colors.foreground }]}>
                  {figure.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!showIntro && summary && summary.entries === 0 ? (
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Nothing from M-Pesa saved for {monthName} yet. Bring in your messages or statement and this fills in.
          </Text>
        ) : null}

        {canImport ? (
          <Pressable
            onPress={() => {
              if (showIntro) void rememberMpesaCard('done', groupId);
              router.push('/mpesa-import' as never);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            testID="mpesa-home-card-open"
          >
            <Feather name="smartphone" size={16} color={colors.primaryForeground} />
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>
              {summary?.imported ? 'Bring in more M-Pesa' : 'Import my M-Pesa'}
            </Text>
          </Pressable>
        ) : null}

        {showIntro ? (
          <Pressable
            onPress={() => {
              void rememberMpesaCard('dismissed', groupId);
              setIntroOpen(false);
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.later}
            testID="mpesa-home-card-later"
          >
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Not now</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 6, overflow: 'hidden', shadowColor: '#D9663B', shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6 },
  weave: { flexDirection: 'row', height: 6 },
  inner: { padding: 16, gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.6 },
  latest: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 24 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  figures: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 12 },
  figure: { flex: 1, minWidth: 0 },
  figureLabel: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  figureValue: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 2 },
  primary: { flexDirection: 'row', gap: 8, borderRadius: 4, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  later: { alignSelf: 'center', paddingVertical: 2 },
});
