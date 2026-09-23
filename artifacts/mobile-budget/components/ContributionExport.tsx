import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQuery } from '@tanstack/react-query';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { writePdf } from '@/lib/savePdf';
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
  bankName: string | null;
};
type ContributionStatement = {
  periodLabel: string;
  contributors: Array<{ id: number; name: string }>;
  entries: StatementEntry[];
  totalsByContributor: Record<number, number>;
  grandTotal: number;
  /** Deposits that reached the bank belonging to nobody. Deliberately outside
   *  grandTotal: crediting them to a member would overstate what they gave. */
  groupFunding?: Array<{ transactionId: number; date: string; description: string | null; amount: number }>;
  groupFundingTotal?: number;
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

  // Named rather than omitted. Leaving it out is what made the bank balance
  // and the contributions disagree with nothing to explain the gap.
  if (statement.groupFundingTotal) {
    lines.push(`Held for the group (nobody's contribution): ${kes(statement.groupFundingTotal)}`);
  }

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
          (entry) =>
            `${shortDay(entry.date)}  ${entry.contributorName}  ${kes(entry.amount)}` +
            (entry.source === 'deposit' ? `  (${entry.bankName ?? 'bank'})` : ''),
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
  // What the downloaded PDF includes — the on-screen preview and WhatsApp
  // text are unaffected, only the PDF itself.
  const [includeEntries, setIncludeEntries] = useState(true);
  const [includePerMemberTotals, setIncludePerMemberTotals] = useState(true);
  const [viewing, setViewing] = useState(false);
  const [viewData, setViewData] = useState<ContributionStatement | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const { refetch } = useQuery<ContributionGrid>({
    queryKey: ['contribution-grid', months],
    queryFn: () => customFetch(`/api/contributions/grid?months=${months}`),
    retry: false,
    enabled: false,
  });

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

  const toggleView = () => setViewing((value) => !value);

  // The report re-fetches whenever the range it should show changes — not
  // just the moment it opens. Without this, switching from "Monthly grid" to
  // "Dated ledger", or picking a different day while already viewing, left
  // the old range's entries on screen under new, mismatched From/To fields.
  useEffect(() => {
    if (!viewing || !isManager) return;
    let active = true;
    setViewLoading(true);
    customFetch(`/api/contributions/statement?from=${encodeURIComponent(viewFrom)}&to=${encodeURIComponent(viewTo)}`)
      .then((statement) => {
        if (active) setViewData(statement as ContributionStatement);
      })
      .catch(() => {
        if (active) setViewData(null);
      })
      .finally(() => {
        if (active) setViewLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, viewFrom, viewTo, isManager]);

  // Every hook above runs on every render. This used to sit above the effect,
  // so the first render — before useGetGroup had answered, when isManager is
  // still false — registered one hook fewer than the render after it. React
  // threw on the mismatch and the card came up blank for the very people it is
  // for. A guard that skips hooks has to come after all of them.
  if (!isManager) return null;

  const viewQuery = `from=${encodeURIComponent(viewFrom)}&to=${encodeURIComponent(viewTo)}`;

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      // The dated statement PDF for exactly what View shows.
      const pdfQuery = `${viewQuery}&includeEntries=${includeEntries}&includePerMemberTotals=${includePerMemberTotals}`;
      const blob = (await customFetch(`/api/contributions/statement.pdf?${pdfQuery}`, {
        responseType: 'blob',
        cache: 'no-store',
      })) as Blob;
      const file = await writePdf(Paths.cache, `jamvi-contribution-ledger-${viewFrom}-to-${viewTo}.pdf`, blob);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available', 'This device cannot open the share sheet. The PDF was saved to the app, but there is no way to hand it off from here.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save or share the contribution report',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      // This screen is already owner/admin-only (see isManager above), so a
      // failure here is never actually a permissions problem. It is either the
      // request not reaching the server or the server failing to build the
      // PDF, and those want different things from the reader — blaming the
      // connection for a 500 sends people to restart their router.
      const status = (error as { response?: { status?: number }; status?: number } | null)?.response?.status
        ?? (error as { status?: number } | null)?.status;
      // The reason was thrown away and replaced with a guess, so three rounds
      // of "still not working" told nobody anything. Whatever actually failed
      // — the request, writing the file, or the share sheet — says so here.
      const detail = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'Could not create the report',
        [
          status != null && status >= 500
            ? 'The server could not build the report.'
            : status != null
              ? `The server refused the request (${status}).`
              : 'The report failed on this phone, not on the server.',
          '',
          detail,
        ].join('\n'),
      );
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

      const statement = (await customFetch(`/api/contributions/statement?${viewQuery}`)) as ContributionStatement;
      if (!statement.entries || statement.entries.length === 0) {
        Alert.alert('Nothing in that range', 'Pick a different range.');
        return;
      }
      const text = buildStatementText(group?.name ?? 'Our group', statement, verifyUrl);

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

      <View style={styles.sections}>
        <Pressable
          onPress={() => setIncludeEntries((on) => !on)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityState={{ selected: includeEntries }}
          accessibilityLabel={includeEntries ? 'Remove the dated entries from the PDF' : 'Include the dated entries in the PDF'}
          testID="contribution-export-include-entries"
          style={styles.sectionToggle}
        >
          <Feather name={includeEntries ? 'check-square' : 'square'} size={14} color={colors.foreground} />
          <Text style={[styles.sectionToggleLabel, { color: colors.foreground }]}>Dated entries</Text>
        </Pressable>
        <Pressable
          onPress={() => setIncludePerMemberTotals((on) => !on)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityState={{ selected: includePerMemberTotals }}
          accessibilityLabel={includePerMemberTotals ? 'Remove the by-member totals from the PDF' : 'Include the by-member totals in the PDF'}
          testID="contribution-export-include-by-member"
          style={styles.sectionToggle}
        >
          <Feather name={includePerMemberTotals ? 'check-square' : 'square'} size={14} color={colors.foreground} />
          <Text style={[styles.sectionToggleLabel, { color: colors.foreground }]}>By-member totals</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={toggleView}
        disabled={busy !== null}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.primary },
          (pressed || busy !== null) && { opacity: 0.85 },
        ]}
      >
        <Feather name={viewing ? 'eye-off' : 'eye'} size={16} color={colors.primaryForeground} />
        <Text style={[styles.btnLabel, { color: colors.primaryForeground }]}>
          {viewing ? 'Hide report' : 'View report'}
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
            {/* Shown beside the contributions rather than folded into them.
                A deposit nobody claimed is real money in the bank and no
                member's contribution; omitting it is what left the two
                figures unable to reconcile. */}
            {viewData.groupFundingTotal ? (
              <Text testID="statement-group-funding" style={[styles.stmtSub, { color: colors.mutedForeground }]}>
                Held for the group: KES {kes(viewData.groupFundingTotal)} — nobody&apos;s contribution
              </Text>
            ) : null}

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
                      {entry.source === 'deposit' ? (
                        <Text style={{ color: colors.mutedForeground }}>{`  via ${entry.bankName ?? 'bank'}`}</Text>
                      ) : null}
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

      {viewing && !viewLoading && viewData && viewData.entries.length > 0 ? (
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
            <Text style={[styles.btnLabel, { color: '#ffffff' }]}>Send on WhatsApp</Text>
          </Pressable>

          <Pressable
            onPress={downloadPdf}
            disabled={busy !== null}
            style={({ pressed }) => [
              styles.btn,
              { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              (pressed || busy !== null) && { opacity: 0.85 },
            ]}
          >
            {busy === 'pdf' ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Feather name="download" size={16} color={colors.foreground} />
            )}
            <Text style={[styles.btnLabel, { color: colors.foreground }]}>Download PDF</Text>
          </Pressable>
        </View>
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
  sections: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  sectionToggleLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
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
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  // "Send on WhatsApp" is the longest label sharing this style, in a
  // flex:1 half-width button next to "Download PDF" - at the previous fixed
  // height:44 with no allowance for wrapping, it overflowed the button on
  // narrower screens instead of wrapping inside it. minHeight above lets the
  // button grow for a wrapped second line; flexShrink/textAlign keep that
  // line centered instead of pushing the icon out of the row.
  btnLabel: { flexShrink: 1, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_700Bold' },
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
