import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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

type StatementEntry = {
  contributorId: number;
  contributorName: string;
  date: string;
  amount: number;
  source: 'recorded' | 'deposit';
};
type ContributionStatement = {
  periodLabel: string;
  contributors: Array<{ id: number; name: string }>;
  entries: StatementEntry[];
  totalsByContributor: Record<number, number>;
  grandTotal: number;
};

const RANGES = [3, 6, 12] as const;
const WHATSAPP_GREEN = '#25D366';
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function kes(value: number): string {
  const absolute = Math.abs(Math.round(value)).toLocaleString('en-KE');
  return value < 0 ? `-KES ${absolute}` : `KES ${absolute}`;
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStartIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** The earliest day the statement can reach — the server loads 12 months. */
function ledgerFloor(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 11, 1);
}

function longDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortDay(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day ?? 1} ${MONTH_ABBR[(month ?? 1) - 1] ?? ''}`;
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
 * The dated ledger as a WhatsApp message: the exact period, a movements total,
 * a per-member breakdown, then each dated entry. Mirrors the web app's
 * buildStatementWhatsAppText — it lists what came in, not an
 * expected-versus-actual position.
 */
function buildStatementText(groupName: string, statement: ContributionStatement, verifyUrl?: string): string {
  const asAt = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines: string[] = [
    `*${groupName}*`,
    `Contribution ledger  |  ${statement.periodLabel}`,
    `As at ${asAt}`,
    '',
    `Total in this period: ${kes(statement.grandTotal)}   (${statement.entries.length} ${statement.entries.length === 1 ? 'entry' : 'entries'})`,
  ];

  const perMember = statement.contributors
    .map((row) => ({ name: row.name, total: statement.totalsByContributor[row.id] ?? 0 }))
    .filter((row) => row.total !== 0);
  if (perMember.length > 0) {
    lines.push('');
    lines.push('*By member*');
    lines.push(...perMember.map((row, index) => `${index + 1}. ${row.name}: ${kes(row.total)}`));
  }

  lines.push('');
  lines.push('*Entries*');
  lines.push(
    ...(statement.entries.length
      ? statement.entries.map(
          (entry) => `${shortDay(entry.date)}  ${entry.contributorName}  ${kes(entry.amount)}${entry.source === 'deposit' ? '  (bank)' : ''}`,
        )
      : ['Nothing recorded in this period.']),
  );
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
 * Download the contribution record as a PDF, or share the same figures to
 * WhatsApp — the way chamas and churches already pass a treasurer's report
 * around. "Monthly grid" is the whole-month expected-versus-actual sheet;
 * "Dated ledger" is an exact day range, entry by entry — the only way to cover
 * part of a month. Owners and admins only, matching the endpoint.
 */
export function ContributionExport() {
  const colors = useColors();
  const { data: group } = useGetGroup();
  const isManager = group?.role === 'owner' || group?.role === 'admin';

  const [mode, setMode] = useState<'grid' | 'ledger'>('grid');
  const [months, setMonths] = useState<number>(6);
  const [dayFrom, setDayFrom] = useState<string>(monthStartIso);
  const [dayTo, setDayTo] = useState<string>(() => isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [busy, setBusy] = useState<null | 'pdf' | 'whatsapp'>(null);
  const [viewing, setViewing] = useState(false);
  const [viewData, setViewData] = useState<ContributionStatement | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const { refetch } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', months],
    queryFn: () => customFetch(`/api/contributions/grid?months=${months}`),
    retry: false,
    enabled: false,
  });

  if (!isManager) return null;

  const [rangeStart, rangeEnd] = dayFrom <= dayTo ? [dayFrom, dayTo] : [dayTo, dayFrom];
  const statementQuery = `from=${encodeURIComponent(rangeStart)}&to=${encodeURIComponent(rangeEnd)}`;

  // The on-screen report always reads as a dated list. In grid mode the last
  // N months become a from/to span.
  const gridStart = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (months - 1));
    return isoDay(d);
  };
  const viewFrom = mode === 'ledger' ? rangeStart : gridStart();
  const viewTo = mode === 'ledger' ? rangeEnd : isoDay(new Date());

  const toggleView = async () => {
    if (viewing) {
      setViewing(false);
      return;
    }
    setViewing(true);
    setViewLoading(true);
    try {
      const statement = (await customFetch(
        `/api/contributions/statement?from=${encodeURIComponent(viewFrom)}&to=${encodeURIComponent(viewTo)}`,
      )) as ContributionStatement;
      setViewData(statement);
    } catch {
      setViewData(null);
    } finally {
      setViewLoading(false);
    }
  };

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const path =
        mode === 'ledger'
          ? `/api/contributions/statement.pdf?${statementQuery}`
          : `/api/contributions/report.pdf?months=${months}`;
      const blob = (await customFetch(path, { responseType: 'blob', cache: 'no-store' })) as Blob;
      const stamp = new Date();
      const name =
        mode === 'ledger'
          ? `jamvi-contribution-ledger-${rangeStart}-to-${rangeEnd}.pdf`
          : `jamvi-contributions-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}.pdf`;
      const file = new File(Paths.cache, name);
      file.write(new Uint8Array(await blob.arrayBuffer()));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('unavailable');
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: mode === 'ledger' ? 'Save or share the contribution ledger' : 'Save or share the contribution report',
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
      // The verify link is a nicety, not a blocker — if it fails, still share.
      let verifyUrl: string | undefined;
      try {
        const link = (await customFetch('/api/contributions/verify-link')) as { url?: string };
        verifyUrl = link.url;
      } catch {
        verifyUrl = undefined;
      }

      let text: string;
      if (mode === 'ledger') {
        const statement = (await customFetch(`/api/contributions/statement?${statementQuery}`)) as ContributionStatement;
        if (!statement.entries || statement.entries.length === 0) {
          Alert.alert('Nothing in that range', 'Pick a different from and to date.');
          return;
        }
        text = buildStatementText(group?.name ?? 'Our group', statement, verifyUrl);
      } else {
        const { data: grid } = await refetch();
        if (!grid) throw new Error('no grid');
        text = buildWhatsAppText(group?.name ?? 'Our group', grid, verifyUrl);
      }

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
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

      <View style={styles.modes}>
        {(['grid', 'ledger'] as const).map((option) => {
          const active = mode === option;
          return (
            <Pressable
              key={option}
              onPress={() => setMode(option)}
              disabled={busy !== null}
              style={[
                styles.modeBtn,
                { borderColor: colors.border },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.modeLabel, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {option === 'grid' ? 'Monthly grid' : 'Dated ledger'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {mode === 'grid'
          ? 'A month-by-month sheet, expected against actual — save it as a PDF or send to WhatsApp.'
          : 'Every entry between two days, with a running total. The only way to cover part of a month.'}
      </Text>

      {mode === 'grid' ? (
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
                  style={[styles.rangeLabel, { color: active ? colors.primaryForeground : colors.mutedForeground }]}
                >
                  Last {range} months
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.dayRow}>
          {(['from', 'to'] as const).map((which) => {
            const value = which === 'from' ? dayFrom : dayTo;
            return (
              <Pressable
                key={which}
                onPress={() => setPicker(which)}
                disabled={busy !== null}
                style={[styles.dayField, { borderColor: colors.border }]}
              >
                <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{which === 'from' ? 'From' : 'To'}</Text>
                <View style={styles.dayValueRow}>
                  <Feather name="calendar" size={13} color={colors.primary} />
                  <Text style={[styles.dayValue, { color: colors.foreground }]}>{longDay(value)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {mode === 'ledger' ? (
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Hand-recorded contributions are dated to the first of their month; bank deposits carry their real date.
        </Text>
      ) : null}

      {picker && (
        <DateTimePicker
          value={new Date((picker === 'from' ? dayFrom : dayTo) + 'T00:00:00')}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          minimumDate={ledgerFloor()}
          maximumDate={new Date()}
          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
            const which = picker;
            setPicker(Platform.OS === 'ios' ? which : null);
            if (selected && which) {
              const iso = isoDay(selected);
              if (which === 'from') setDayFrom(iso);
              else setDayTo(iso);
            }
          }}
        />
      )}

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

      <Pressable
        onPress={toggleView}
        disabled={busy !== null}
        style={[styles.viewBtn, { borderColor: colors.border }]}
      >
        <Feather name={viewing ? 'eye-off' : 'eye'} size={14} color={colors.mutedForeground} />
        <Text style={[styles.viewLabel, { color: colors.foreground }]}>
          {viewing ? 'Hide report' : 'View report here'}
        </Text>
      </Pressable>

      {viewing ? (
        viewLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 4 }} />
        ) : !viewData ? (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>The report could not be loaded.</Text>
        ) : (
          <View style={[styles.stmt, { borderColor: colors.border }]}>
            <Text style={[styles.stmtPeriod, { color: colors.foreground }]}>{viewData.periodLabel}</Text>
            <Text style={[styles.stmtSub, { color: colors.mutedForeground }]}>
              {viewData.entries.length} {viewData.entries.length === 1 ? 'entry' : 'entries'} · KES {kes(viewData.grandTotal)} in total
            </Text>

            {viewData.entries.length === 0 ? (
              <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 6 }]}>Nothing recorded in this range.</Text>
            ) : (
              <View style={{ marginTop: 6 }}>
                {viewData.entries.map((entry, index) => (
                  <View
                    key={`${entry.date}-${index}`}
                    style={[styles.stmtRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <Text style={[styles.stmtDate, { color: colors.mutedForeground }]}>{shortDay(entry.date)}</Text>
                    <Text style={[styles.stmtName, { color: colors.foreground }]} numberOfLines={1}>
                      {entry.contributorName}
                      {entry.source === 'deposit' ? <Text style={{ color: colors.mutedForeground }}>  bank</Text> : null}
                    </Text>
                    <Text style={[styles.stmtAmount, { color: colors.foreground }]}>KES {kes(entry.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {viewData.contributors.some((c) => (viewData.totalsByContributor[c.id] ?? 0) !== 0) ? (
              <View style={[styles.stmtByMember, { borderTopColor: colors.border }]}>
                <Text style={[styles.stmtByMemberHead, { color: colors.mutedForeground }]}>BY MEMBER</Text>
                {viewData.contributors
                  .map((c) => ({ name: c.name, total: viewData.totalsByContributor[c.id] ?? 0 }))
                  .filter((row) => row.total !== 0)
                  .map((row) => (
                    <View key={row.name} style={styles.stmtByMemberRow}>
                      <Text style={[styles.stmtName, { color: colors.foreground }]} numberOfLines={1}>{row.name}</Text>
                      <Text style={[styles.stmtAmount, { color: colors.foreground }]}>KES {kes(row.total)}</Text>
                    </View>
                  ))}
              </View>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  modes: { flexDirection: 'row', gap: 6 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  modeLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, lineHeight: 17 },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  rangeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  dayRow: { flexDirection: 'row', gap: 10 },
  dayField: { flex: 1, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8, gap: 3 },
  dayLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  dayValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  note: { fontSize: 11, lineHeight: 16 },
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
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  viewLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  stmt: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginTop: 4 },
  stmtPeriod: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  stmtSub: { fontSize: 11, marginTop: 1 },
  stmtRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  stmtDate: { width: 46, fontSize: 11, fontFamily: 'Inter_500Medium' },
  stmtName: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  stmtAmount: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  stmtByMember: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 8, gap: 4 },
  stmtByMemberHead: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  stmtByMemberRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
