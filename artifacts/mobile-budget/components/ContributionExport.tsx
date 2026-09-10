import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQuery } from '@tanstack/react-query';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type GridMonth = { month: number; year: number; label: string };
type GridRow = {
  contributorId: number;
  name: string;
  monthlyTarget: number | null;
  amounts: number[];
  total: number;
  outstanding: Array<number | null>;
  creditRemaining: number;
};
type ContributionGrid = {
  months: GridMonth[];
  rows: GridRow[];
  columnTotals: number[];
  grandTotal: number;
};

const RANGES = [3, 6, 12] as const;
const WHATSAPP_GREEN = '#25D366';

function kes(value: number): string {
  const absolute = Math.abs(Math.round(value)).toLocaleString('en-KE');
  return value < 0 ? `-KES ${absolute}` : `KES ${absolute}`;
}

function periodLabel(months: GridMonth[]): string {
  if (months.length === 0) return '';
  if (months.length === 1) return months[0].label;
  return `${months[0].label} – ${months[months.length - 1].label}`;
}

/**
 * The plain-text contribution summary for a WhatsApp message, laid out as a
 * treasurer's report: a titled header with the period and the date it was run,
 * a short summary block, then a numbered line per member with their total and
 * where they stand. Mirrors the web app's buildContributionWhatsAppText — a
 * chat message is read, not studied.
 */
function buildWhatsAppText(groupName: string, grid: ContributionGrid, verifyUrl?: string): string {
  const monthCount = grid.months.length;
  const asAt = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  let expectedTotal = 0;
  let paidUp = 0;
  let behindCount = 0;
  const memberLines = grid.rows.map((row, index) => {
    const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : 0;
    expectedTotal += expected;
    let note = '';
    if (expected > 0) {
      const diff = row.total - expected;
      if (diff < 0) {
        behindCount += 1;
        note = `  — short ${kes(-diff)}`;
      } else {
        paidUp += 1;
        if (diff > 0) note = `  — ${kes(diff)} ahead`;
      }
    }
    return `${index + 1}. ${row.name}: ${kes(row.total)}${note}`;
  });

  const lines: string[] = [
    `*${groupName}*`,
    `Contribution report  |  ${periodLabel(grid.months)}`,
    `As at ${asAt}`,
    '',
    '*Summary*',
  ];

  if (expectedTotal > 0) {
    const balance = grid.grandTotal - expectedTotal;
    lines.push(`Members: ${grid.rows.length}   Paid up: ${paidUp}   Behind: ${behindCount}`);
    lines.push(`Collected: ${kes(grid.grandTotal)} of ${kes(expectedTotal)} expected`);
    lines.push(
      balance < 0 ? `Shortfall: ${kes(-balance)}` : balance > 0 ? `Surplus: ${kes(balance)}` : 'On target',
    );
  } else {
    lines.push(`Members: ${grid.rows.length}`);
    lines.push(`Collected: ${kes(grid.grandTotal)}`);
  }

  lines.push('');
  lines.push('*Contributions*');
  lines.push(...(memberLines.length ? memberLines : ['No contributors recorded yet.']));
  lines.push('');
  if (verifyUrl) {
    lines.push('Check this is genuine — the figures update live:');
    lines.push(verifyUrl);
    lines.push('');
  }
  lines.push('Prepared with Jamvi');

  return lines.join('\n');
}

/**
 * Download the month-by-month contribution report as a PDF, or share the same
 * figures as a WhatsApp message — the way chamas and churches already pass a
 * treasurer's report around. Owners and admins only, matching the endpoint.
 */
export function ContributionExport() {
  const colors = useColors();
  const { data: group } = useGetGroup();
  const isManager = group?.role === 'owner' || group?.role === 'admin';

  const [months, setMonths] = useState<number>(6);
  const [busy, setBusy] = useState<null | 'pdf' | 'whatsapp'>(null);

  const { refetch } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', months],
    queryFn: () => customFetch(`/api/contributions/grid?months=${months}`),
    retry: false,
    enabled: false,
  });

  if (!isManager) return null;

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const blob = (await customFetch(`/api/contributions/report.pdf?months=${months}`, {
        responseType: 'blob',
        cache: 'no-store',
      })) as Blob;
      const stamp = new Date();
      const file = new File(
        Paths.cache,
        `jamvi-contributions-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}.pdf`,
      );
      file.write(new Uint8Array(await blob.arrayBuffer()));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('unavailable');
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save or share the contribution report',
        UTI: 'com.adobe.pdf',
      });
    } catch {
      Alert.alert('Could not create the report', 'Check your group access and try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const shareToWhatsApp = async () => {
    setBusy('whatsapp');
    try {
      const { data: grid } = await refetch();
      if (!grid) throw new Error('no grid');
      // The verify link is a nicety, not a blocker — if it fails, still share.
      let verifyUrl: string | undefined;
      try {
        const link = (await customFetch('/api/contributions/verify-link')) as { url?: string };
        verifyUrl = link.url;
      } catch {
        verifyUrl = undefined;
      }
      const url = `https://wa.me/?text=${encodeURIComponent(
        buildWhatsAppText(group?.name ?? 'Our group', grid, verifyUrl),
      )}`;
      const opened = await Linking.canOpenURL(url);
      if (!opened) throw new Error('cannot open');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open WhatsApp', 'Try again in a moment, or use Download PDF instead.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <Feather name="share-2" size={15} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.foreground }]}>Share the report</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        A month-by-month sheet for the group — save it as a PDF or send the figures to WhatsApp.
      </Text>

      <View style={styles.ranges}>
        {RANGES.map((range) => {
          const active = months === range;
          return (
            <Pressable
              key={range}
              onPress={() => setMonths(range)}
              disabled={busy !== null}
              style={[
                styles.rangeBtn,
                { borderColor: colors.border },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.rangeLabel,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                Last {range} months
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={shareToWhatsApp}
          disabled={busy !== null}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: WHATSAPP_GREEN },
            (pressed || busy !== null) && { opacity: 0.85 },
          ]}
        >
          {busy === 'whatsapp' ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <FontAwesome name="whatsapp" size={18} color="#ffffff" />
          )}
          <Text style={[styles.btnLabel, { color: '#ffffff' }]}>WhatsApp</Text>
        </Pressable>

        <Pressable
          onPress={downloadPdf}
          disabled={busy !== null}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary },
            (pressed || busy !== null) && { opacity: 0.85 },
          ]}
        >
          {busy === 'pdf' ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="download" size={16} color={colors.primaryForeground} />
          )}
          <Text style={[styles.btnLabel, { color: colors.primaryForeground }]}>Download PDF</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12, lineHeight: 17 },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  rangeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
  },
  btnLabel: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
