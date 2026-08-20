import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks/useColors';
import {
  getDashboardMonthlyReportPdf,
  useGetExpenses,
  useGetDashboardCategoryBreakdown,
  getGetDashboardIncomeStreamsQueryKey,
  useGetDashboardIncomeStreams,
  useGetDashboardSummary,
  useGetMembers,
  useGetSavingsGoals,
} from '@workspace/api-client-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Food: 'shopping-cart',
  Transport: 'truck',
  Health: 'heart',
  Education: 'book',
  Utilities: 'zap',
  Entertainment: 'tv',
  Clothing: 'tag',
  Savings: 'archive',
  Housing: 'home',
  Communication: 'phone',
  Other: 'more-horizontal',
};

const MEMBER_COLORS = ['#22c55e', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b'];

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f97316',
  Transport: '#8b5cf6',
  Health: '#ef4444',
  Education: '#3b82f6',
  Utilities: '#eab308',
  Entertainment: '#ec4899',
  Clothing: '#14b8a6',
  Savings: '#22c55e',
  Housing: '#f59e0b',
  Communication: '#6366f1',
  Other: '#6b7280',
};

function formatKES(n?: number | null): string {
  if (n == null) return 'KES 0';
  return `KES ${Math.round(n).toLocaleString()}`;
}

function shortKES(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function MonthPicker({
  month, year, onChange, colors,
}: {
  month: number; year: number;
  onChange: (m: number, y: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const prev = () => {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  };
  const next = () => {
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  };
  const isCurrentMonth = (() => {
    const now = new Date();
    return month === now.getMonth() + 1 && year === now.getFullYear();
  })();

  return (
    <View style={styles.monthPicker}>
      <Pressable onPress={prev} hitSlop={12} style={styles.monthArrow}>
        <Feather name="chevron-left" size={20} color="rgba(255,255,255,0.8)" />
      </Pressable>
      <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
      <Pressable onPress={next} hitSlop={12} style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}>
        <Feather name="chevron-right" size={20} color={isCurrentMonth ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)'} />
      </Pressable>
    </View>
  );
}

// ── Budget vs Actual row ─────────────────────────────────────────────────────

function BudgetRow({
  category, budgetAmount, spentAmount, colors,
}: {
  category: string;
  budgetAmount: number;
  spentAmount: number;
  colors: ReturnType<typeof useColors>;
}) {
  const icon   = CATEGORY_ICONS[category] ?? 'more-horizontal';
  const accent = CATEGORY_COLORS[category] ?? '#6b7280';
  const over   = spentAmount > budgetAmount;
  const pct    = budgetAmount > 0 ? Math.min(spentAmount / budgetAmount, 1) : 0;
  const variance = budgetAmount - spentAmount;          // positive = under
  const varColor = over ? '#ef4444' : '#22c55e';

  return (
    <View style={[styles.budgetRow, { backgroundColor: colors.card, borderColor: over ? 'rgba(239,68,68,0.25)' : colors.border }]}>
      {/* Icon */}
      <View style={[styles.catIcon, { backgroundColor: accent + '22' }]}>
        <Feather name={icon} size={14} color={accent} />
      </View>

      {/* Content */}
      <View style={styles.budgetRowContent}>
        {/* Top: name + amounts */}
        <View style={styles.budgetRowTop}>
          <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>{category}</Text>
          <View style={styles.budgetAmounts}>
            <Text style={[styles.budgetActual, { color: over ? '#ef4444' : colors.foreground }]}>
              {formatKES(spentAmount)}
            </Text>
            <Text style={[styles.budgetOf, { color: colors.mutedForeground }]}>
              {' / '}{formatKES(budgetAmount)}
            </Text>
          </View>
        </View>

        {/* Bar: budget baseline, fills red if over */}
        <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
          <View style={[
            styles.barFill,
            { width: `${pct * 100}%` as any, backgroundColor: over ? '#ef4444' : accent },
          ]} />
        </View>

        {/* Variance */}
        <Text style={[styles.variance, { color: varColor }]}>
          {over
            ? `▲ ${formatKES(Math.abs(variance))} over budget`
            : `${formatKES(variance)} remaining`}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleMonthChange = useCallback((m: number, y: number) => {
    setMonth(m); setYear(y);
  }, []);

  const queryParams = { month, year };

  const { data: expenses    = [], isLoading: loadingExp,     refetch: refetchExp     } = useGetExpenses(queryParams);
  const { data: catBreakdown = [], isLoading: loadingCat,    refetch: refetchCat     } = useGetDashboardCategoryBreakdown(queryParams);
  const { data: summary,          isLoading: loadingSummary, refetch: refetchSummary } = useGetDashboardSummary(queryParams);
  const {
    data: incomeStreamReport,
    isLoading: loadingIncomeStreams,
    isError: incomeStreamsError,
    refetch: refetchIncomeStreams,
  } = useGetDashboardIncomeStreams(queryParams, {
    query: { queryKey: getGetDashboardIncomeStreamsQueryKey(queryParams), retry: false },
  });
  const { data: members = [] } = useGetMembers();

  const isLoading = loadingExp || loadingCat || loadingSummary;

  const onRefresh = useCallback(() => {
    refetchExp(); refetchCat(); refetchSummary(); refetchIncomeStreams();
  }, [refetchExp, refetchCat, refetchSummary, refetchIncomeStreams]);

  const exportPdf = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const pdf = await getDashboardMonthlyReportPdf({ month, year }, { responseType: 'blob', cache: 'no-store' });
      const file = new File(Paths.cache, `bajeti-monthly-report-${year}-${String(month).padStart(2, '0')}.pdf`);
      file.write(new Uint8Array(await pdf.arrayBuffer()));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device.');
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save or share monthly report',
        UTI: 'com.adobe.pdf',
      });
    } catch {
      setExportError('Couldn’t create the PDF. Check your group access and try again.');
    } finally {
      setIsExporting(false);
    }
  }, [month, year]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalBudget  = summary?.totalBudget  ?? 0;
  const totalSpent   = summary?.totalSpent   ?? 0;
  const memberContribs = useMemo(() => {
    const raw = ((summary as any)?.memberContributions ?? []) as {
      userId: string; name: string;
      contributed: number; spent: number; net: number; target: number | null;
    }[];
    return raw.filter(m => m.contributed > 0 || m.spent > 0);
  }, [summary]);

  const totalMemberContribs = memberContribs.reduce((s, m) => s + m.contributed, 0);

  // Category rows sorted: over-budget first, then by % used desc
  const sortedCategories = useMemo(() => {
    return [...(catBreakdown as any[])].map(c => ({
      category:     (c.category    ?? '') as string,
      budgetAmount: (c.budgetAmount ?? 0) as number,
      spentAmount:  (c.spentAmount  ?? 0) as number,
      percentUsed:  (c.percentUsed  ?? 0) as number,
    })).sort((a, b) => {
      const aOver = a.spentAmount > a.budgetAmount;
      const bOver = b.spentAmount > b.budgetAmount;
      if (aOver !== bOver) return aOver ? -1 : 1;
      return b.percentUsed - a.percentUsed;
    });
  }, [catBreakdown]);

  const overBudgetCount  = sortedCategories.filter(c => c.spentAmount > c.budgetAmount).length;
  const totalVariance    = totalBudget - totalSpent;
  const budgetPct        = totalBudget > 0 ? Math.min(totalSpent / totalBudget * 100, 100) : 0;
  const isOverBudget     = totalSpent > totalBudget;

  // Member spending
  const memberSpending = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach(e => {
      if (e.paidById) map.set(e.paidById, (map.get(e.paidById) ?? 0) + (e.amount ?? 0));
    });
    return members
      .map(m => ({ ...m, spent: map.get(m.userId ?? '') ?? 0 }))
      .filter(m => m.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [expenses, members]);

  // Top 5 expenses
  const topExpenses = useMemo(
    () => [...expenses].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5),
    [expenses]
  );

  // Savings goals
  const { data: goalsRaw = [] } = useGetSavingsGoals();
  const goals = useMemo(() =>
    [...(goalsRaw as any[])].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return aDeadline - bDeadline;
    })
  , [goalsRaw]);

  // Daily spending for the selected month
  const dailySpending = useMemo(() => {
    const map = new Map<number, number>();
    (expenses as any[]).forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date);
      if (d.getMonth() + 1 !== month || d.getFullYear() !== year) return;
      const day = d.getDate();
      map.set(day, (map.get(day) ?? 0) + (Number(e.amount) || 0));
    });
    const days = [...map.entries()].sort((a, b) => a[0] - b[0]);
    const max = days.reduce((m, [, v]) => Math.max(m, v), 1);
    return { days, max };
  }, [expenses, month, year]);

  // Recurring expenses
  const recurringExpenses = useMemo(() =>
    (expenses as any[]).filter(e => e.isRecurring).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  , [expenses]);
  const recurringTotal = recurringExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <LinearGradient
        colors={['#0a3d2e', '#0d5c44']}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 12 : 8) }]}
      >
        <Text style={styles.headerTitle}>Reports</Text>
          <View style={styles.headerControls}>
            <MonthPicker month={month} year={year} onChange={handleMonthChange} colors={colors} />
            <Pressable
              onPress={exportPdf}
              disabled={isLoading || isExporting}
              style={[styles.pdfButton, (isLoading || isExporting) && styles.pdfButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel={`Download ${MONTHS[month - 1]} ${year} report as PDF`}
            >
              {isExporting ? <ActivityIndicator color="#0a3d2e" size="small" /> : <Feather name="download" size={16} color="#0a3d2e" />}
              <Text style={styles.pdfButtonText}>{isExporting ? 'Creating…' : 'PDF'}</Text>
            </Pressable>
          </View>
          {exportError && <Text style={styles.pdfError}>{exportError}</Text>}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Summary cards ── */}
          <View style={styles.cardsRow}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="trending-down" size={18} color="#ef4444" />
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Spent</Text>
              <Text style={[styles.cardAmount, { color: colors.foreground }]}>KES {shortKES(totalSpent)}</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{expenses.length} transactions</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="sliders" size={18} color="#60a5fa" />
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Budget</Text>
              <Text style={[styles.cardAmount, { color: colors.foreground }]}>KES {shortKES(totalBudget)}</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{sortedCategories.length} categories</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="trending-up" size={18} color="#22c55e" />
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>In</Text>
              <Text style={[styles.cardAmount, { color: colors.foreground }]}>KES {shortKES(totalMemberContribs)}</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>contributions</Text>
            </View>
          </View>

          {/* ── Overall budget utilisation bar ── */}
          <View style={[styles.utilisationCard, {
            backgroundColor: colors.card,
            borderColor: isOverBudget ? 'rgba(239,68,68,0.3)' : colors.border,
          }]}>
            <View style={styles.utilisationTop}>
              <View>
                <Text style={[styles.utilisationLabel, { color: colors.mutedForeground }]}>
                  BUDGET UTILISATION — {MONTHS_SHORT[month - 1]} {year}
                </Text>
                <Text style={[styles.utilisationPct, { color: isOverBudget ? '#ef4444' : colors.foreground }]}>
                  {budgetPct.toFixed(0)}% used
                  {overBudgetCount > 0 && (
                    <Text style={{ color: '#ef4444', fontSize: 13 }}>
                      {'  '}·{'  '}{overBudgetCount} {overBudgetCount === 1 ? 'category' : 'categories'} over
                    </Text>
                  )}
                </Text>
              </View>
              <View style={styles.utilisationVariance}>
                <Feather
                  name={isOverBudget ? 'alert-circle' : 'check-circle'}
                  size={16}
                  color={isOverBudget ? '#ef4444' : '#22c55e'}
                />
                <Text style={[styles.utilisationVarText, { color: isOverBudget ? '#ef4444' : '#22c55e' }]}>
                  {isOverBudget ? '▲ ' : ''}{formatKES(Math.abs(totalVariance))}
                </Text>
                <Text style={[styles.utilisationVarSub, { color: colors.mutedForeground }]}>
                  {isOverBudget ? 'over' : 'left'}
                </Text>
              </View>
            </View>
            <View style={[styles.bigBarBg, { backgroundColor: colors.muted }]}>
              <View style={[
                styles.bigBarFill,
                { width: `${budgetPct}%` as any, backgroundColor: isOverBudget ? '#ef4444' : '#22c55e' },
              ]} />
            </View>
            <View style={styles.utilisationFooter}>
              <Text style={[styles.utilisationFooterText, { color: colors.mutedForeground }]}>
                KES {shortKES(totalSpent)} spent of KES {shortKES(totalBudget)} budgeted
              </Text>
            </View>
          </View>

          {/* ── Contributions per member ── */}
          {memberContribs.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contributions</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                What each member put into the group
              </Text>
              {memberContribs.map((m, idx) => {
                const hue = MEMBER_COLORS[idx % MEMBER_COLORS.length];
                const target = m.target ?? 0;
                const pct = target > 0 ? Math.min(m.contributed / target * 100, 100) : null;
                const sharePct = totalMemberContribs > 0 ? Math.round(m.contributed / totalMemberContribs * 100) : 0;
                const isAhead = m.net >= 0;
                return (
                  <View key={m.userId} style={[styles.contribCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Name + amount header */}
                    <View style={styles.contribHeader}>
                      <View style={[styles.memberAvatar, { backgroundColor: hue + '22' }]}>
                        <Text style={[styles.memberInitial, { color: hue }]}>
                          {(m.name ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.contribHeaderInfo}>
                        <Text style={[styles.contribName, { color: colors.foreground }]}>{m.name}</Text>
                        <Text style={[styles.contribShare, { color: colors.mutedForeground }]}>
                          {sharePct}% of group total
                        </Text>
                      </View>
                      <View style={styles.contribAmountBlock}>
                        <Text style={[styles.contribAmount, { color: '#22c55e' }]}>{formatKES(m.contributed)}</Text>
                        <Text style={[styles.contribAmountSub, { color: colors.mutedForeground }]}>contributed</Text>
                      </View>
                    </View>

                    {/* Target progress */}
                    {pct !== null && (
                      <View style={{ gap: 4 }}>
                        <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                          <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: pct >= 100 ? '#22c55e' : hue }]} />
                        </View>
                        <Text style={[styles.variance, { color: colors.mutedForeground }]}>
                          {pct.toFixed(0)}% of {formatKES(target)} target
                          {pct >= 100
                            ? '  ✓ Target met!'
                            : `  ·  ${formatKES(target - m.contributed)} to go`}
                        </Text>
                      </View>
                    )}

                    {/* Spent + net */}
                    <View style={styles.contribFooter}>
                      <View style={styles.contribStat}>
                        <Text style={[styles.contribStatLabel, { color: colors.mutedForeground }]}>Spent</Text>
                        <Text style={[styles.contribStatValue, { color: colors.foreground }]}>{formatKES(m.spent)}</Text>
                      </View>
                      <View style={[styles.contribNetChip, {
                        backgroundColor: isAhead ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      }]}>
                        <Feather
                          name={isAhead ? 'arrow-up' : 'arrow-down'}
                          size={12}
                          color={isAhead ? '#22c55e' : '#ef4444'}
                        />
                        <Text style={[styles.contribNetText, { color: isAhead ? '#22c55e' : '#ef4444' }]}>
                          {`KES ${shortKES(Math.abs(m.net))} ${isAhead ? 'ahead' : 'behind'}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Income streams ── */}
          <View style={styles.section}>
            <View style={styles.incomeStreamHeading}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Income Streams</Text>
                <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                  Expected income, recorded funding, and what remains this month
                </Text>
              </View>
              <Feather name="pie-chart" size={19} color={colors.primary} />
            </View>

            {loadingIncomeStreams ? (
              <View style={[styles.incomeStreamStatus, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.incomeStreamStatusText, { color: colors.mutedForeground }]}>Loading income streams…</Text>
              </View>
            ) : incomeStreamsError ? (
              <Pressable
                onPress={() => refetchIncomeStreams()}
                style={[styles.incomeStreamStatus, { backgroundColor: colors.card, borderColor: '#ef444455' }]}
              >
                <Feather name="alert-circle" size={20} color="#ef4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.incomeStreamStatusTitle, { color: colors.foreground }]}>Couldn’t load income streams</Text>
                  <Text style={[styles.incomeStreamStatusText, { color: colors.mutedForeground }]}>Tap to try again.</Text>
                </View>
              </Pressable>
            ) : (incomeStreamReport?.streams.length ?? 0) === 0 ? (
              <View style={[styles.incomeStreamStatus, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="credit-card" size={20} color={colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.incomeStreamStatusTitle, { color: colors.foreground }]}>No funding recorded yet</Text>
                  <Text style={[styles.incomeStreamStatusText, { color: colors.mutedForeground }]}>
                    Choose an income stream when recording an expense or bank deposit to see it here.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.incomeStreamTotal, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '28' }]}>
                  <Text style={[styles.incomeStreamTotalLabel, { color: colors.mutedForeground }]}>EXPECTED · RECORDED · BALANCE</Text>
                  <Text style={[styles.incomeStreamTotalAmount, { color: colors.foreground }]}>
                    {formatKES(incomeStreamReport?.totalExpected)} · {formatKES(incomeStreamReport?.totalFunding)} · {formatKES(Math.abs(incomeStreamReport?.remainingBalance ?? 0))}
                  </Text>
                </View>
                {incomeStreamReport?.streams.map(stream => {
                  const unattributed = stream.incomeSourceId == null;
                  const accent = unattributed ? '#f59e0b' : colors.primary;
                  return (
                    <View
                      key={stream.incomeSourceId ?? 'unattributed'}
                      style={[styles.incomeStreamCard, {
                        backgroundColor: colors.card,
                        borderColor: unattributed ? '#f59e0b55' : colors.border,
                      }]}
                    >
                      <View style={styles.incomeStreamRow}>
                        <View style={[styles.incomeStreamIcon, { backgroundColor: accent + '1C' }]}>
                          <Feather name={unattributed ? 'help-circle' : 'credit-card'} size={16} color={accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.incomeStreamName, { color: colors.foreground }]} numberOfLines={1}>{stream.sourceName}</Text>
                          <Text style={[styles.incomeStreamOwner, { color: colors.mutedForeground }]} numberOfLines={1}>{stream.ownerName}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.incomeStreamAmount, { color: colors.foreground }]}>{formatKES(stream.total)}</Text>
                          <Text style={[styles.variance, { color: colors.mutedForeground }]}>of {formatKES(stream.expectedMonthlyAmount)}</Text>
                        </View>
                      </View>
                      <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                        <View style={[styles.barFill, { width: `${Math.min(stream.sharePercent, 100)}%` as any, backgroundColor: accent }]} />
                      </View>
                      <View style={styles.incomeStreamMeta}>
                        <Text style={[styles.variance, { color: stream.remainingBalance < 0 ? colors.primary : colors.mutedForeground }]}>{stream.remainingBalance < 0 ? `${formatKES(Math.abs(stream.remainingBalance))} above expected` : `${formatKES(stream.remainingBalance)} remaining`}</Text>
                        <Text style={[styles.variance, { color: colors.mutedForeground }]}>{stream.transactionCount} {stream.transactionCount === 1 ? 'record' : 'records'}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* ── Savings goals ── */}
          {goals.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Savings Goals</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                {goals.filter(g => !g.isCompleted).length} active
                {goals.filter(g => g.isCompleted).length > 0 ? `  ·  ${goals.filter(g => g.isCompleted).length} completed` : ''}
              </Text>
              {goals.map(g => {
                const pct = g.targetAmount > 0 ? Math.min(g.currentAmount / g.targetAmount * 100, 100) : 0;
                const remaining = Math.max(g.targetAmount - g.currentAmount, 0);
                const deadline = g.deadline ? new Date(g.deadline + 'T00:00:00') : null;
                const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000) : null;
                const isCompleted = g.isCompleted || pct >= 100;
                const accent = isCompleted ? '#22c55e' : '#60a5fa';
                return (
                  <View key={g.id} style={[styles.savingsCard, {
                    backgroundColor: colors.card,
                    borderColor: isCompleted ? 'rgba(34,197,94,0.35)' : colors.border,
                    opacity: isCompleted ? 0.85 : 1,
                  }]}>
                    <View style={styles.contribHeader}>
                      <View style={[styles.catIcon, { backgroundColor: accent + '22' }]}>
                        <Feather name={isCompleted ? 'check-circle' : 'target'} size={14} color={accent} />
                      </View>
                      <View style={styles.contribHeaderInfo}>
                        <Text style={[styles.contribName, { color: colors.foreground }]}>{g.name}</Text>
                        {deadline && !isCompleted && (
                          <Text style={[styles.contribShare, {
                            color: daysLeft !== null && daysLeft <= 30 ? '#f59e0b'
                              : daysLeft !== null && daysLeft < 0 ? '#ef4444'
                              : colors.mutedForeground,
                          }]}>
                            {daysLeft === null ? '' : daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due today' : 'Overdue'}
                          </Text>
                        )}
                        {isCompleted && (
                          <Text style={[styles.contribShare, { color: '#22c55e' }]}>Funded ✓</Text>
                        )}
                      </View>
                      <View style={styles.contribAmountBlock}>
                        <Text style={[styles.contribAmount, { color: accent }]}>{formatKES(g.currentAmount)}</Text>
                        <Text style={[styles.contribAmountSub, { color: colors.mutedForeground }]}>
                          of {formatKES(g.targetAmount)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ gap: 4 }}>
                      <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: accent }]} />
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.variance, { color: colors.mutedForeground }]}>
                          {pct.toFixed(0)}% funded
                        </Text>
                        {remaining > 0 && (
                          <Text style={[styles.variance, { color: colors.mutedForeground }]}>
                            {formatKES(remaining)} to go
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Budget vs Actual by category ── */}
          {sortedCategories.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Budget vs Actual</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                Over-budget categories shown first
              </Text>
              {sortedCategories.map(cat => (
                <BudgetRow
                  key={cat.category}
                  category={cat.category}
                  budgetAmount={cat.budgetAmount}
                  spentAmount={cat.spentAmount}
                  colors={colors}
                />
              ))}
            </View>
          )}

          {/* ── Who spent ── */}
          {memberSpending.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Who Spent</Text>
              {memberSpending.map((m, idx) => {
                const pct = totalSpent > 0 ? Math.round((m.spent / totalSpent) * 100) : 0;
                const hue = idx === 0 ? '#f97316' : '#8b5cf6';
                return (
                  <View key={m.userId} style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.memberAvatar, { backgroundColor: hue + '22' }]}>
                      <Text style={[styles.memberInitial, { color: hue }]}>
                        {(m.userName ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.budgetRowContent}>
                      <View style={styles.budgetRowTop}>
                        <Text style={[styles.catName, { color: colors.foreground }]}>{m.userName?.split(' ')[0]}</Text>
                        <Text style={[styles.catAmount, { color: colors.foreground }]}>{formatKES(m.spent)}</Text>
                      </View>
                      <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: hue }]} />
                      </View>
                      <Text style={[styles.variance, { color: colors.mutedForeground }]}>{pct}% of total expenses</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Daily spending trend ── */}
          {dailySpending.days.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daily Spending</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                {MONTHS_SHORT[month - 1]} {year}  ·  peak {shortKES(dailySpending.max)} on day{' '}
                {dailySpending.days.find(([, v]) => v === dailySpending.max)?.[0]}
              </Text>
              <View style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.trendBars}
                >
                  {dailySpending.days.map(([day, amount]) => {
                    const barH = Math.max(6, Math.round((amount / dailySpending.max) * 72));
                    const isPeak = amount === dailySpending.max;
                    return (
                      <View key={day} style={styles.trendBarCol}>
                        {isPeak && (
                          <Text style={[styles.trendPeakLabel, { color: colors.primary }]}>
                            {shortKES(amount)}
                          </Text>
                        )}
                        <View style={styles.trendBarWrap}>
                          <View style={[styles.trendBar, {
                            height: barH,
                            backgroundColor: isPeak ? colors.primary : colors.primary + '55',
                          }]} />
                        </View>
                        <Text style={[styles.trendDayNum, { color: isPeak ? colors.primary : colors.mutedForeground }]}>
                          {day}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}

          {/* ── Recurring expenses ── */}
          {recurringExpenses.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recurring</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                {formatKES(recurringTotal)} committed  ·  {recurringExpenses.length} item{recurringExpenses.length !== 1 ? 's' : ''}
              </Text>
              {recurringExpenses.slice(0, 5).map(e => {
                const accent = CATEGORY_COLORS[(e.category ?? '') as string] ?? '#6b7280';
                const icon = CATEGORY_ICONS[(e.category ?? '') as string] ?? 'repeat';
                return (
                  <View key={e.id} style={[styles.expRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.catIcon, { backgroundColor: accent + '22' }]}>
                      <Feather name={icon} size={14} color={accent} />
                    </View>
                    <View style={styles.expInfo}>
                      <Text style={[styles.expDesc, { color: colors.foreground }]} numberOfLines={1}>{e.description}</Text>
                      <View style={styles.expMeta}>
                        <View style={[styles.expCatChip, { backgroundColor: accent + '22' }]}>
                          <Text style={[styles.expCatText, { color: accent }]}>{e.category}</Text>
                        </View>
                        <View style={[styles.expCatChip, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
                          <Text style={[styles.expCatText, { color: '#fbbf24' }]}>Recurring</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[styles.expAmount, { color: colors.foreground }]}>{formatKES(e.amount)}</Text>
                  </View>
                );
              })}
              {recurringExpenses.length > 5 && (
                <Text style={[styles.sectionSub, { color: colors.mutedForeground, textAlign: 'center' }]}>
                  +{recurringExpenses.length - 5} more recurring items
                </Text>
              )}
            </View>
          )}

          {/* ── Largest expenses ── */}
          {topExpenses.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Largest Expenses</Text>
              {topExpenses.map((e, idx) => {
                const accent = CATEGORY_COLORS[e.category ?? ''] ?? '#6b7280';
                return (
                  <View key={e.id} style={[styles.expRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.expRank, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.expRankText, { color: colors.mutedForeground }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.expInfo}>
                      <Text style={[styles.expDesc, { color: colors.foreground }]} numberOfLines={1}>{e.description}</Text>
                      <View style={styles.expMeta}>
                        <View style={[styles.expCatChip, { backgroundColor: accent + '22' }]}>
                          <Text style={[styles.expCatText, { color: accent }]}>{e.category}</Text>
                        </View>
                        <Text style={[styles.expDate, { color: colors.mutedForeground }]}>
                          {e.date ? new Date(e.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : ''}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.expAmount, { color: colors.foreground }]}>{formatKES(e.amount)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {expenses.length === 0 && !isLoading && (
            <View style={styles.empty}>
              <Feather name="bar-chart-2" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No data for {MONTHS_SHORT[month - 1]} {year}</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Log expenses to see your report here</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#fff', marginBottom: 12 },
  headerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, backgroundColor: '#ffffff', paddingHorizontal: 11, paddingVertical: 9 },
  pdfButtonDisabled: { opacity: 0.55 },
  pdfButtonText: { color: '#0a3d2e', fontSize: 12, fontFamily: 'Inter_700Bold' },
  pdfError: { color: '#fee2e2', fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 17 },

  monthPicker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  monthArrow: { padding: 4 },
  monthArrowDisabled: { opacity: 0.4 },
  monthLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#fff', minWidth: 140, textAlign: 'center' },

  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12 },

  // Summary cards (3 across)
  cardsRow: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  cardLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5 },
  cardAmount: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 1 },
  cardSub: { fontSize: 10, fontFamily: 'Inter_400Regular' },

  // Overall utilisation card
  utilisationCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  utilisationTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  utilisationLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  utilisationPct: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  utilisationVariance: { alignItems: 'flex-end', gap: 2 },
  utilisationVarText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  utilisationVarSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  bigBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bigBarFill: { height: 8, borderRadius: 4 },
  utilisationFooter: { alignItems: 'center' },
  utilisationFooterText: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  // Section
  section: { gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  sectionSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -4, marginBottom: 2 },

  // Budget vs Actual row
  budgetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  budgetRowContent: { flex: 1, gap: 5 },
  budgetRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetAmounts: { flexDirection: 'row', alignItems: 'baseline' },
  budgetActual: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  budgetOf: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  variance: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Shared
  catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catName: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1, marginRight: 8 },
  catAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  barBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },

  // Who spent
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  memberInitial: { fontSize: 16, fontFamily: 'Inter_700Bold' },

  // Largest expenses
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  expRank: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  expRankText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  expInfo: { flex: 1, gap: 4 },
  expDesc: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  expMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expCatChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  expCatText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  expDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  expAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Contributions section
  contribCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  contribHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contribHeaderInfo: { flex: 1 },
  contribName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  contribShare: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  contribAmountBlock: { alignItems: 'flex-end' },
  contribAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  contribAmountSub: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
  contribFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  contribStat: { gap: 1 },
  contribStatLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.4 },
  contribStatValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  contribNetChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  contribNetText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  // Income streams
  incomeStreamHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  incomeStreamStatus: { minHeight: 88, borderRadius: 12, borderWidth: 1, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  incomeStreamStatusTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  incomeStreamStatusText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 2 },
  incomeStreamTotal: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  incomeStreamTotalLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  incomeStreamTotalAmount: { fontSize: 21, fontFamily: 'Inter_700Bold', marginTop: 4 },
  incomeStreamCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10, marginBottom: 9 },
  incomeStreamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  incomeStreamIcon: { height: 32, width: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  incomeStreamName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  incomeStreamOwner: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  incomeStreamAmount: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  incomeStreamMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },

  // Savings goal cards
  savingsCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },

  // Completed goals badge
  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },

  // Daily trend bar chart
  trendCard: { borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, gap: 5 },
  trendBarCol: { alignItems: 'center', gap: 3, minWidth: 22 },
  trendBarWrap: { height: 80, justifyContent: 'flex-end' },
  trendBar: { width: 14, borderRadius: 4 },
  trendPeakLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  trendDayNum: { fontSize: 9, fontFamily: 'Inter_400Regular' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
