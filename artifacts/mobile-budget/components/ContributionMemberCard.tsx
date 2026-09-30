import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { breakdownEntries, sourceParts, targetProgress, type MemberBreakdown } from '@/lib/contributionInsights';

const kes = (n: number) => Math.round(n).toLocaleString('en-KE');
const shortDay = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
};
const SHOWN = 25;

/**
 * One member's month: what they put in against what is expected, where it
 * came from, and - tapped - every entry behind the figure.
 */
export function ContributionMemberCard({
  member, month, year, canManage,
}: {
  member: { userId: string; name: string; contributed: number; spent: number; net: number; target: number | null };
  month: number;
  year: number;
  canManage: boolean;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const breakdown = useQuery({
    queryKey: ['member-breakdown', member.userId, month, year],
    queryFn: () => customFetch<MemberBreakdown>(`/api/dashboard/member-breakdown?userId=${encodeURIComponent(member.userId)}&month=${month}&year=${year}`),
    staleTime: 60_000,
  });
  const progress = targetProgress(member.contributed, member.target);
  const parts = sourceParts(breakdown.data?.totals);
  const entries = breakdownEntries(breakdown.data);
  const shown = showAll ? entries : entries.slice(0, SHOWN);

  return (
    <Pressable
      onPress={() => setOpen((value) => !value)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${member.name}, KES ${kes(member.contributed)} this month. ${open ? 'Hide' : 'Show'} the entries.`}
      testID={`contribution-member-${member.userId}`}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '1f' }]}>
          <Text style={[styles.initial, { color: colors.primary }]}>{member.name.trim()[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{member.name}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            Spent KES {kes(member.spent)} · Net <Text style={{ color: member.net >= 0 ? colors.primary : colors.destructive }}>KES {kes(member.net)}</Text>
          </Text>
        </View>
        <Text style={[styles.amount, { color: colors.primary }]}>KES {kes(member.contributed)}</Text>
      </View>

      {progress ? (
        <View style={{ marginTop: 12 }} testID="contribution-member-progress">
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={[styles.fill, { width: `${Math.round(progress.share * 100)}%`, backgroundColor: progress.met ? colors.primary : '#f59e0b' }]} />
          </View>
          <Text style={[styles.meta, { color: progress.met ? colors.primary : colors.mutedForeground, marginTop: 5 }]}>
            {progress.met ? '✓ ' : ''}{progress.label}
          </Text>
        </View>
      ) : (
        <View style={styles.noTarget}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>No monthly target</Text>
          {canManage ? (
            <Pressable onPress={() => router.push('/contribution-plan')} hitSlop={8} accessibilityRole="button" testID="contribution-set-target">
              <Text style={[styles.link, { color: colors.primary }]}>Set a target</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {breakdown.isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      ) : parts.length > 0 ? (
        <View style={styles.parts} testID="contribution-member-sources">
          {parts.map((part) => (
            <View key={part.label} style={[styles.part, { backgroundColor: colors.muted }]}>
              <Text style={[styles.partLabel, { color: colors.mutedForeground }]}>{part.label}</Text>
              <Text style={[styles.partAmount, { color: colors.foreground }]}>KES {kes(part.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.toggle}>
        <Text style={[styles.link, { color: colors.primary }]}>
          {open ? 'Hide entries' : `See ${entries.length > 0 ? entries.length : ''} ${entries.length === 1 ? 'entry' : 'entries'}`.replace('  ', ' ')}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
      </View>

      {open ? (
        <View style={{ marginTop: 6 }} testID="contribution-member-entries">
          {entries.length === 0 ? (
            <Text style={[styles.meta, { color: colors.mutedForeground, paddingVertical: 8 }]}>Nothing recorded for this month.</Text>
          ) : shown.map((entry) => (
            <View key={entry.key} style={[styles.entry, { borderColor: colors.border }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.entryLabel, { color: colors.foreground }]} numberOfLines={1}>{entry.label}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>{entry.kind} · {shortDay(entry.date)}</Text>
              </View>
              <Text style={[styles.entryAmount, { color: colors.foreground }]}>KES {kes(entry.amount)}</Text>
            </View>
          ))}
          {entries.length > SHOWN ? (
            <Pressable onPress={() => setShowAll((value) => !value)} hitSlop={8} accessibilityRole="button" style={{ paddingTop: 8 }}>
              <Text style={[styles.link, { color: colors.primary }]}>{showAll ? 'Show fewer' : `Show all ${entries.length}`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  amount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  noTarget: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  part: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  partLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.3 },
  partAmount: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  entryLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  entryAmount: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
