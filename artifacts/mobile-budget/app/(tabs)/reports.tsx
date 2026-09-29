import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
  Modal,
  Alert,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { isoDay, longDay, monthStartIso, orderedRange } from '@/lib/dayRange';
import { writePdf } from '@/lib/savePdf';
import { budgetReport, householdRows } from '@/lib/budgetReport';
import { PDF_SECTIONS, DEFAULT_PDF_SECTIONS, parsePdfSections, pdfSectionParams, type PdfSectionKey } from '@/lib/reportPdfSections';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useQueryClient } from '@tanstack/react-query';
import {
  getDashboardMonthlyReportPdf,
  useGetExpenses,
  useGetDashboardCategoryBreakdown,
  getGetDashboardIncomeStreamsQueryKey,
  getGetDashboardBusinessQueryKey,
  useGetDashboardIncomeStreams,
  getGetDashboardIncomeStreamsTrendQueryKey,
  getGetDashboardIncomeLedgerQueryKey,
  useGetDashboardIncomeLedger,
  useGetDashboardIncomeStreamsTrend,
  useGetDashboardSummary,
  useGetMembers,
  useGetSavingsGoals,
  useGetGroup,
  useGetBudgetCategories,
  getGetBudgetCategoriesQueryKey,
  useUpdateBudgetCategory,
} from '@workspace/api-client-react';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { WorkspaceIdentityRow } from '@/components/WorkspaceIdentityRow';
import { useHasBusiness } from '@/hooks/useHasBusiness';
import { ScreenHint } from '@/components/ScreenHint';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const MEMBER_COLORS = ['#08B7B0', '#FDBB0A', '#003383', '#3CDD62', '#6C9FE6', '#C98C00'];

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#C98C00',
  Transport: '#08B7B0',
  Health: '#D92626',
  Education: '#003383',
  Utilities: '#FDBB0A',
  Entertainment: '#6C9FE6',
  Clothing: '#087F8C',
  Savings: '#209E45',
  Housing: '#B56D0A',
  Communication: '#2D70C8',
  Other: '#6B7280',
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
  const icon   = getCategoryIcon(category);
  const accent = CATEGORY_COLORS[category] ?? '#6b7280';
  const over   = spentAmount > budgetAmount;
  const pct    = budgetAmount > 0 ? Math.min(spentAmount / budgetAmount, 1) : 0;
  const variance = budgetAmount - spentAmount;          // positive = under
  const varColor = over ? colors.destructive : colors.success;

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
            <Text style={[styles.budgetActual, { color: over ? colors.destructive : colors.foreground }]}>
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
            { width: `${pct * 100}%` as any, backgroundColor: over ? colors.destructive : accent },
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

/** Which income streams show their details, on this phone. */
const STREAM_DETAILS_KEY = 'jamvi:income-stream-details-open';
/** Entries shown per stream before the rest are left to All income. */
const STREAM_DETAIL_ROWS = 10;

/** What goes in the report PDF, on this phone. */
const PDF_SECTIONS_KEY = 'jamvi:report-pdf-sections';

export default function ReportsScreen() {
  const colors = useColors();
  const { data: group } = useGetGroup();
  // A PDF is a copy that can be forwarded, so only an owner or admin makes one
  // (the server refuses everybody else). A Personal budget is its owner's.
  const canDownloadPdf = group?.isPrivate !== false || group?.role === 'owner' || group?.role === 'admin';
  // Linking a category as a stream's cost is a category edit, and the server
  // only lets a manager make those.
  const canManageCostCategories = group?.role === 'owner' || group?.role === 'admin';
  const queryClient = useQueryClient();
  const { data: categories = [] } = useGetBudgetCategories();
  const updateCostCategory = useUpdateBudgetCategory();
  const [costCategoryFor, setCostCategoryFor] = useState<{ incomeSourceId: number; sourceName: string } | null>(null);
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // The report could only ever cover a whole month. A day range answers the
  // question people actually bring to it — "what did we spend between these
  // two dates" — without waiting for the month to end.
  const [customDates, setCustomDates] = useState(false);
  const [dayFrom, setDayFrom] = useState<string>(monthStartIso);
  const [dayTo, setDayTo] = useState<string>(() => isoDay(new Date()));
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  // What the PDF includes beyond the always-present summary cards.
  // What goes in the PDF, chosen on a sheet the PDF button opens, and
  // remembered on this phone for next time.
  const [pdfSections, setPdfSections] = useState<Record<PdfSectionKey, boolean>>(DEFAULT_PDF_SECTIONS);
  const [pdfChooserOpen, setPdfChooserOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(PDF_SECTIONS_KEY)
      .then((raw) => setPdfSections(parsePdfSections(raw)))
      .catch(() => {});
  }, []);
  const togglePdfSection = (key: PdfSectionKey) =>
    setPdfSections((current) => {
      const next = { ...current, [key]: !current[key] };
      AsyncStorage.setItem(PDF_SECTIONS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });

  // The summary cards describe sections that are already further down this
  // page, but only one of the three was pressable, so the other two read as
  // dead tiles. Tapping one now jumps to the section it summarises.
  const scrollRef = useRef<ScrollView>(null);
  const sectionTops = useRef<Record<string, number>>({});
  const captureSection = useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      sectionTops.current[key] = event.nativeEvent.layout.y;
    },
    [],
  );
  const jumpToSection = useCallback((key: string) => {
    const y = sectionTops.current[key];
    if (y == null) return;
    // A little above the heading, so it does not sit flush under the header.
    scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
  }, []);
  const [watchDetailsOpen, setWatchDetailsOpen] = useState(false);
  // Business's Change costs arrives with the stream whose costs to change.
  const { costsFor, costsName } = useLocalSearchParams<{ costsFor?: string; costsName?: string }>();

  const handleMonthChange = useCallback((m: number, y: number) => {
    setMonth(m); setYear(y);
  }, []);

  const queryParams = { month, year };

  const { data: expenses    = [], isLoading: loadingExp,     isError: expensesError, refetch: refetchExp     } = useGetExpenses(queryParams);
  const { data: catBreakdown = [], isLoading: loadingCat,    isError: categoryError, refetch: refetchCat     } = useGetDashboardCategoryBreakdown(queryParams);
  const { data: summary,          isLoading: loadingSummary, isError: summaryError, refetch: refetchSummary } = useGetDashboardSummary(queryParams);
  const {
    data: incomeStreamReport,
    isLoading: loadingIncomeStreams,
    isError: incomeStreamsError,
    refetch: refetchIncomeStreams,
  } = useGetDashboardIncomeStreams(queryParams, {
    query: { queryKey: getGetDashboardIncomeStreamsQueryKey(queryParams), retry: false },
  });
  const {
    data: incomeTrend,
    isLoading: loadingIncomeTrend,
    isError: incomeTrendError,
    refetch: refetchIncomeTrend,
  } = useGetDashboardIncomeStreamsTrend(
    { months: 6 },
    { query: { queryKey: getGetDashboardIncomeStreamsTrendQueryKey({ months: 6 }), retry: false } },
  );
  const { data: members = [] } = useGetMembers();

  // Each income stream's details - its entries this month and each cost linked
  // to it - open one at a time or all at once, as on Business. Off until asked
  // for, and remembered on this phone. The unattributed card is 0: no real id is.
  const [detailedStreams, setDetailedStreams] = useState<Set<number>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(STREAM_DETAILS_KEY)
      .then((raw) => { if (raw) setDetailedStreams(new Set((JSON.parse(raw) as number[]).filter(Number.isFinite))); })
      .catch(() => {});
  }, []);
  const keepStreamDetails = (next: Set<number>) => {
    setDetailedStreams(next);
    AsyncStorage.setItem(STREAM_DETAILS_KEY, JSON.stringify([...next])).catch(() => {});
  };
  const streamKey = (incomeSourceId: number | null | undefined) => incomeSourceId ?? 0;
  const toggleStreamDetails = (key: number) => {
    const next = new Set(detailedStreams);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    keepStreamDetails(next);
  };
  const streamKeys = (incomeStreamReport?.streams ?? []).map((stream) => streamKey(stream.incomeSourceId));
  const allStreamsDetailed = streamKeys.length > 0 && streamKeys.every((key) => detailedStreams.has(key));
  const toggleAllStreamDetails = () => keepStreamDetails(allStreamsDetailed ? new Set() : new Set(streamKeys));
  // The entries come from All income's own list, and are only asked for while shown.
  const showingStreamDetails = streamKeys.some((key) => detailedStreams.has(key));
  const { data: incomeLedger, isLoading: loadingIncomeLedger } = useGetDashboardIncomeLedger(queryParams, {
    query: { queryKey: getGetDashboardIncomeLedgerQueryKey(queryParams), enabled: showingStreamDetails, retry: false },
  });
  const streamEntries = (incomeSourceId: number | null | undefined) =>
    (incomeLedger?.entries ?? []).flatMap((entry) => {
      const amount = entry.portions
        .filter((portion) => (portion.incomeSourceId ?? null) === (incomeSourceId ?? null))
        .reduce((sum, portion) => sum + portion.amount, 0);
      return amount > 0 ? [{ id: entry.id, date: entry.date, description: entry.description, amount }] : [];
    });

  useEffect(() => {
    const id = Number(costsFor);
    // Wait for the group, which says whether this person may change costs.
    if (!costsFor || !Number.isFinite(id) || !group) return;
    router.setParams({ costsFor: undefined, costsName: undefined });
    jumpToSection('income');
    if (canManageCostCategories) setCostCategoryFor({ incomeSourceId: id, sourceName: costsName ?? 'this stream' });
  }, [costsFor, costsName, group, canManageCostCategories, jumpToSection]);

  const isLoading = loadingExp || loadingCat || loadingSummary;

  const onRefresh = useCallback(() => {
    refetchExp(); refetchCat(); refetchSummary(); refetchIncomeStreams(); refetchIncomeTrend();
  }, [refetchExp, refetchCat, refetchSummary, refetchIncomeStreams, refetchIncomeTrend]);

  /**
   * What a tap has asked for, shown at once. The tick used to wait for the save
   * and then for the category list to come back, so on a slow connection a tap
   * seemed to do nothing and people tapped again.
   */
  const hasBusiness = useHasBusiness();
  const [pendingCost, setPendingCost] = useState<Record<number, number | null>>({});
  const applyCostCategoryChange = useCallback(async (categoryId: number, reducesIncomeSourceId: number | null) => {
    setPendingCost((current) => ({ ...current, [categoryId]: reducesIncomeSourceId }));
    try {
      await updateCostCategory.mutateAsync({ id: categoryId, data: { reducesIncomeSourceId } });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardIncomeStreamsQueryKey(queryParams) });
      // Every month's statement, not one: the key's params are a prefix match.
      void queryClient.invalidateQueries({ queryKey: getGetDashboardBusinessQueryKey() });
    } catch {
      Alert.alert('Could not update the cost category', 'Please try again.');
    } finally {
      setPendingCost((current) => {
        const next = { ...current };
        delete next[categoryId];
        return next;
      });
    }
  }, [updateCostCategory, queryClient, queryParams]);
  const costLinkOf = (category: { id: number; reducesIncomeSourceId?: number | null }) =>
    category.id in pendingCost ? pendingCost[category.id] : category.reducesIncomeSourceId ?? null;

  // What kind of cost a linked category is on the business's profit and loss:
  // cost of goods sold (stock, fuel) or a running expense (repairs, rent).
  // Shown at once, like the tick, and saved as it is tapped.
  const [pendingKind, setPendingKind] = useState<Record<number, 'cogs' | 'expense'>>({});
  const costKindOf = (category: { id: number; costKind?: string | null }) =>
    pendingKind[category.id] ?? (category.costKind === 'expense' ? 'expense' : 'cogs');
  const applyCostKind = useCallback(async (categoryId: number, costKind: 'cogs' | 'expense') => {
    setPendingKind((current) => ({ ...current, [categoryId]: costKind }));
    try {
      await updateCostCategory.mutateAsync({ id: categoryId, data: { costKind } });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardBusinessQueryKey() });
    } catch {
      Alert.alert('Could not change the kind of cost', 'Please try again.');
    } finally {
      setPendingKind((current) => {
        const next = { ...current };
        delete next[categoryId];
        return next;
      });
    }
  }, [updateCostCategory, queryClient]);

  // Any number of categories can reduce the same stream's profit at once —
  // toggling one on or off never disturbs any other category already linked
  // to it. A category already linked to a DIFFERENT stream asks first,
  // since a category can only ever be the cost of one stream at a time.
  const toggleCostCategory = useCallback((category: { id: number; name: string; reducesIncomeSourceId?: number | null }) => {
    if (!costCategoryFor) return;
    const { incomeSourceId, sourceName } = costCategoryFor;
    const linkedTo = costLinkOf(category);
    if (linkedTo === incomeSourceId) {
      // Asked first: one tap on a ticked row used to unlink it at once, and
      // with it the side hustle's costs left Business and came back into the
      // household's spending - easy to do while reaching for its kind.
      Alert.alert(
        `Stop counting ${category.name} as ${sourceName}'s cost?`,
        `Its spending would count as household spending again, and come off ${sourceName}'s profit no more.`,
        [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Stop counting it', style: 'destructive', onPress: () => void applyCostCategoryChange(category.id, null) },
        ],
      );
      return;
    }
    if (linkedTo != null) {
      Alert.alert(
        'Move this category?',
        `"${category.name}" currently reduces a different stream's profit. Linking it to ${sourceName} instead will unlink it there.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Move it', onPress: () => void applyCostCategoryChange(category.id, incomeSourceId) },
        ],
      );
      return;
    }
    void applyCostCategoryChange(category.id, incomeSourceId);
  }, [costCategoryFor, applyCostCategoryChange, pendingCost]);

  const exportPdf = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const [rangeFrom, rangeTo] = orderedRange(dayFrom, dayTo);
      const pdf = await getDashboardMonthlyReportPdf(
        {
          ...(customDates ? { month, year, from: rangeFrom, to: rangeTo } : { month, year }),
          ...pdfSectionParams(pdfSections, hasBusiness),
        },
        { responseType: 'blob', cache: 'no-store' },
      );
      const [fileFrom, fileTo] = orderedRange(dayFrom, dayTo);
      const file = await writePdf(
        Paths.cache,
        customDates
          ? `jamvi-report-${fileFrom}-to-${fileTo}.pdf`
          : `jamvi-monthly-report-${year}-${String(month).padStart(2, '0')}.pdf`,
        pdf as Blob,
      );
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device.');
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save or share monthly report',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      // This used to blame group access for everything, which sent people
      // hunting through permissions while the real fault was a 500 from the
      // report route. Say which side failed, and never claim it was access
      // unless the server actually said so.
      const status = (error as { response?: { status?: number }; status?: number } | null)?.response?.status
        ?? (error as { status?: number } | null)?.status;
      // Same reason as the contributions export: guessing at the cause hid it.
      const detail = error instanceof Error ? error.message : String(error);
      setExportError(
        status === 401 || status === 403
          ? 'You do not have access to this group’s report.'
          : `${status != null && status >= 500
              ? 'The server could not build the report.'
              : status != null
                ? `The server refused the request (${status}).`
                : 'The report failed on this phone, not on the server.'} ${detail}`,
      );
    } finally {
      setIsExporting(false);
    }
  }, [month, year, customDates, dayFrom, dayTo, pdfSections, hasBusiness]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalBudget  = summary?.totalBudget  ?? 0;
  const totalSpent   = summary?.totalSpent   ?? 0;
  // Money that moved without being earned or spent. Every other figure on this
  // page leaves all three out, correctly — a loan is not income and lending is
  // not spending — but leaving them out everywhere meant the balance could
  // move for reasons the report never mentioned.
  const borrowedTotal   = summary?.borrowedTotal   ?? 0;
  const repaidToUsTotal = summary?.repaidToUsTotal ?? 0;
  const lentTotal       = summary?.lentTotal       ?? 0;
  const movedWithoutEarning = borrowedTotal + repaidToUsTotal + lentTotal;
  const memberContribs = useMemo(() => {
    const raw = ((summary as any)?.memberContributions ?? []) as {
      userId: string; name: string;
      contributed: number; spent: number; net: number; target: number | null;
    }[];
    return raw.filter(m => m.contributed > 0 || m.spent > 0);
  }, [summary]);

  const totalMemberContribs = memberContribs.reduce((s, m) => s + m.contributed, 0);

  // Category rows sorted: over-budget first, then by % used desc
  // The household's categories: a side hustle's costs (Stock) are on
  // Business, and counted there, not here as spending or overspending.
  const sortedCategories = useMemo(() => {
    return householdRows(catBreakdown as any[]).map(c => ({
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

  // Over, the way the Budget report counts it: a heading only when none of
  // its sub-categories already says so, and never spending with no budget
  // behind it - which counted "17 categories over" out of a handful.
  const overRows = useMemo(() => budgetReport(catBreakdown as any[]).over, [catBreakdown]);
  const overBudgetCount  = overRows.length;
  const totalVariance    = totalBudget - totalSpent;
  const budgetPct        = totalBudget > 0 ? Math.min(totalSpent / totalBudget * 100, 100) : 0;
  const isOverBudget     = totalSpent > totalBudget;
  const hasMonthlyActivity = totalSpent > 0 || sortedCategories.some(c => c.spentAmount > 0) || (incomeStreamReport?.totalFunding ?? 0) > 0;
  const fundingGap = incomeStreamReport && incomeStreamReport.totalExpected > 0
    ? incomeStreamReport.totalExpected - incomeStreamReport.totalFunding
    : null;
  // Income less expenses, put beside the two figures it is worked from
  // rather than left as a subtraction the person has to do themselves.
  const netIncomeVsExpenses = (incomeStreamReport?.totalFunding ?? 0) - totalSpent;
  const progressLoading = loadingSummary || loadingCat || loadingIncomeStreams || loadingExp;
  const progressError = summaryError || categoryError || expensesError || incomeStreamsError;
  const progressStatus = totalBudget <= 0
    ? 'No budget yet'
    : !hasMonthlyActivity
      ? 'No activity yet'
      : isOverBudget
        ? 'Needs attention'
        : overBudgetCount > 0 || budgetPct >= 80
          ? 'Watch spending'
          : 'On track';
  const progressLabel = progressLoading
    ? 'Checking this month'
    : progressError
      ? 'Summary unavailable'
      : progressStatus;
  const overBudgetCategoryNames = overRows.map(c => c.category).filter(Boolean);
  const categoriesToWatch = useMemo(
    () => sortedCategories.filter(c => c.spentAmount > c.budgetAmount),
    [sortedCategories],
  );
  const progressTone = progressLoading || progressError
    ? { color: colors.mutedForeground, background: colors.muted, border: colors.border, icon: 'info' as const }
    : progressStatus === 'Needs attention'
    ? { color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', icon: 'alert-triangle' as const }
    : progressStatus === 'Watch spending'
      ? { color: '#d97706', background: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: 'help-circle' as const }
      : { color: colors.primary, background: 'rgba(34,197,94,0.08)', border: colors.border, icon: 'check-circle' as const };

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
        colors={[colors.brandNavy, colors.brandBlue]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 12 : 8) }]}
      >
        <WorkspaceIdentityRow group={group} />
        <Text style={styles.headerTitle}>Reports</Text>
        <ScreenHint light>See where your money came from and where it went.</ScreenHint>
          <View style={styles.headerControls}>
            <MonthPicker month={month} year={year} onChange={handleMonthChange} colors={colors} />
            {canDownloadPdf ? (
            <Pressable
              onPress={() => setPdfChooserOpen(true)}
              testID="report-pdf"
              disabled={isLoading || isExporting}
              style={[styles.pdfButton, (isLoading || isExporting) && styles.pdfButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel={customDates
                ? `Download report for ${longDay(orderedRange(dayFrom, dayTo)[0])} to ${longDay(orderedRange(dayFrom, dayTo)[1])} as PDF`
                : `Download ${MONTHS[month - 1]} ${year} report as PDF`}
            >
              {isExporting ? <ActivityIndicator color={colors.brandNavy} size="small" /> : <Feather name="download" size={16} color={colors.brandNavy} />}
              <Text style={styles.pdfButtonText}>{isExporting ? 'Creating…' : 'PDF'}</Text>
            </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setCustomDates((on) => !on)}
            accessibilityRole="button"
            accessibilityState={{ selected: customDates }}
            accessibilityLabel={customDates ? 'Use the whole month for the report' : 'Choose exact dates for the report'}
            testID="report-custom-dates-toggle"
            style={styles.customDatesToggle}
          >
            <Feather name={customDates ? 'check-square' : 'square'} size={14} color="#FFFFFF" />
            <Text style={styles.customDatesToggleText}>Exact dates</Text>
          </Pressable>
          {customDates && (
            <View style={styles.dayRow}>
              {(['from', 'to'] as const).map((which) => (
                <Pressable
                  key={which}
                  onPress={() => setPicker(which)}
                  style={styles.dayField}
                  accessibilityRole="button"
                  accessibilityLabel={`${which === 'from' ? 'Start' : 'End'} date for the report`}
                  testID={`report-day-${which}`}
                >
                  <Text style={styles.dayLabel}>{which === 'from' ? 'From' : 'To'}</Text>
                  <View style={styles.dayValueRow}>
                    <Feather name="calendar" size={12} color="#FFFFFF" />
                    <Text style={styles.dayValue}>{longDay(which === 'from' ? dayFrom : dayTo)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          {customDates && picker && (
            <DateTimePicker
              value={new Date((picker === 'from' ? dayFrom : dayTo) + 'T00:00:00')}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
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
          {exportError && <Text style={styles.pdfError}>{exportError}</Text>}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <PageScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* A side hustle's profit and loss, first when there is one. */}
          {hasBusiness ? (
            <Pressable
              onPress={() => router.push('/business')}
              accessibilityRole="button"
              accessibilityLabel="See profit and loss for each side hustle"
              testID="open-business"
              style={({ pressed }) => [
                styles.spendOnCard,
                { backgroundColor: colors.card, borderColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Feather name="briefcase" size={18} color={colors.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.spendOnTitle, { color: colors.foreground }]}>Business</Text>
                <Text style={[styles.spendOnSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                  Sales, cost of goods sold, expenses and profit for each side hustle.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {/* Income first: a list of expenses cannot be judged without what
              came in to pay for them, so this is what they are checked against. */}
          <Pressable
            onPress={() => router.push('/income-ledger')}
            accessibilityRole="button"
            accessibilityLabel="See all your income in one list"
            testID="open-income-ledger"
            style={({ pressed }) => [
              styles.spendOnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="arrow-down-circle" size={18} color={colors.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.spendOnTitle, { color: colors.foreground }]}>All income</Text>
              <Text style={[styles.spendOnSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                Everything that came in between two dates, to check your expenses against.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>

          {/* Every other way in goes through a category or a named thing
              first. This is the one that answers "what happened". */}
          <Pressable
            onPress={() => router.push('/expense-ledger')}
            accessibilityRole="button"
            accessibilityLabel="See every expense in one list"
            testID="open-expense-ledger"
            style={({ pressed }) => [
              styles.spendOnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="list" size={18} color={colors.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.spendOnTitle, { color: colors.foreground }]}>All expenses</Text>
              <Text style={[styles.spendOnSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                Everything that happened between two dates, newest first, whatever the category.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>

          {/* Whether the month kept to its budget: planned against spent,
              category by category, overspends first. */}
          <Pressable
            onPress={() => router.push('/budget-report')}
            accessibilityRole="button"
            accessibilityLabel="See your budget against what you spent"
            testID="open-budget-report"
            style={({ pressed }) => [
              styles.spendOnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="target" size={18} color={colors.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.spendOnTitle, { color: colors.foreground }]}>Budget report</Text>
              <Text style={[styles.spendOnSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                What you planned against what you spent, month by month, overspends first.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>

          {/* Categories answer "how much on Food". This answers "how much on
              that thing", which is the question people actually ask. */}
          <Pressable
            onPress={() => router.push('/spending-by-item')}
            accessibilityRole="button"
            accessibilityLabel="See what you spend on each shop, bill or subscription"
            testID="open-spending-by-item"
            style={({ pressed }) => [
              styles.spendOnCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="search" size={18} color={colors.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.spendOnTitle, { color: colors.foreground }]}>What you spend on</Text>
              <Text style={[styles.spendOnSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                How much a particular shop, bill or subscription has cost you over time.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>

          {/* ── Plain-language monthly progress ── */}
          <View
            testID="monthly-progress-summary"
            style={[styles.progressCard, { backgroundColor: progressTone.background, borderColor: progressTone.border }]}
          >
            <View style={styles.progressHeading}>
              <Feather name={progressTone.icon} size={20} color={progressTone.color} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.progressEyebrow, { color: colors.mutedForeground }]}>HOW YOU’RE DOING</Text>
                <View style={styles.progressTitleRow}>
                  <Text style={[styles.progressTitle, { color: colors.foreground }]}>{progressLabel}</Text>
                  <Text style={[styles.progressMonth, { color: colors.mutedForeground }]}>{MONTHS_SHORT[month - 1]} {year}</Text>
                </View>
              </View>
            </View>
            {progressLoading ? (
              <View style={styles.progressMessageRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.progressMessage, { color: colors.mutedForeground }]}>Loading this month’s picture…</Text>
              </View>
            ) : progressError ? (
              <Text style={[styles.progressMessage, { color: colors.mutedForeground }]}>
                We couldn’t load enough information to summarize this month. The detailed report below may still be available.
              </Text>
            ) : totalBudget <= 0 ? (
              <Text style={[styles.progressMessage, { color: colors.mutedForeground }]}>
                No budget categories are set for this month, so there is no spending target to compare with.
              </Text>
            ) : !hasMonthlyActivity ? (
              <Text style={[styles.progressMessage, { color: colors.mutedForeground }]}>
                Nothing has been recorded yet. Your budget is {formatKES(totalBudget)}, with no spending or funding recorded.
              </Text>
            ) : (
              <Text style={[styles.progressMessage, { color: colors.mutedForeground }]}>
                You’ve spent {formatKES(totalSpent)} of {formatKES(totalBudget)} ({Math.round(budgetPct)}%).
                {isOverBudget ? ` That is ${formatKES(totalSpent - totalBudget)} over budget.` : ` You have ${formatKES(totalBudget - totalSpent)} left.`}
                {overBudgetCount > 0 ? ` ${overBudgetCategoryNames.slice(0, 3).join(', ')}${overBudgetCount > 3 ? ' and other categories' : ''} need${overBudgetCount === 1 ? 's' : ''} attention.` : ''}
              </Text>
            )}
            {!progressLoading && !progressError && hasMonthlyActivity && (
              <View
                style={[styles.netBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID="reports-net-income-vs-expenses"
              >
                <Text style={[styles.netBannerLabel, { color: colors.mutedForeground }]}>Income vs. expenses</Text>
                <Text style={[styles.netBannerAmount, { color: netIncomeVsExpenses >= 0 ? colors.primary : colors.destructive }]}>
                  {netIncomeVsExpenses >= 0 ? '+' : '−'}{formatKES(Math.abs(netIncomeVsExpenses))}
                </Text>
              </View>
            )}
            {!progressLoading && !progressError && (
              <View style={styles.progressStats}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Expenses: ${formatKES(totalSpent)} of ${formatKES(totalBudget)} budget. Tap for the category breakdown.`}
                  accessibilityHint="Jumps to Budget vs Actual"
                  onPress={() => jumpToSection('spending')}
                  style={({ pressed }) => [
                    styles.progressStat,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && styles.progressStatPressed,
                  ]}
                >
                  <View style={styles.progressStatHeading}>
                    <Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Expenses</Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </View>
                  <Text style={[styles.progressStatAmount, { color: colors.foreground }]}>{formatKES(totalSpent)}</Text>
                  <Text style={[styles.progressStatSub, { color: colors.mutedForeground }]}>of {formatKES(totalBudget)} budget</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Income: ${formatKES(incomeStreamReport?.totalFunding ?? 0)}. Tap for the income streams.`}
                  accessibilityHint="Jumps to Income Streams"
                  onPress={() => jumpToSection('income')}
                  style={({ pressed }) => [
                    styles.progressStat,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && styles.progressStatPressed,
                  ]}
                >
                  <View style={styles.progressStatHeading}>
                    <Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Income</Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </View>
                  <Text style={[styles.progressStatAmount, { color: colors.foreground }]}>{formatKES(incomeStreamReport?.totalFunding ?? 0)}</Text>
                  <Text style={[styles.progressStatSub, { color: colors.mutedForeground }]}>
                    {incomeStreamReport && incomeStreamReport.totalExpected > 0
                      ? fundingGap !== null && fundingGap >= 0
                        ? `${formatKES(fundingGap)} still expected`
                        : `${formatKES(Math.abs(fundingGap ?? 0))} above expected`
                      : 'No expected-income target'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Categories to watch: ${overBudgetCount}. Tap to see which categories are over budget.`}
                  accessibilityHint="Opens the over-budget category details"
                  onPress={() => setWatchDetailsOpen(true)}
                  style={({ pressed }) => [
                    styles.progressStat,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && styles.progressStatPressed,
                  ]}
                >
                  <View style={styles.progressStatHeading}>
                    <Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Categories to watch</Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </View>
                  <Text style={[styles.progressStatAmount, { color: colors.foreground }]}>{overBudgetCount}</Text>
                  <Text style={[styles.progressStatSub, { color: colors.mutedForeground }]}>
                    {overBudgetCount === 1 ? 'over its budget' : 'Tap to see which ones'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Neither income nor spending, and all of it moves the balance.
              Shown only when there is some: a household that neither borrows
              nor lends never sees it. */}
          {movedWithoutEarning > 0 ? (
            <View
              testID="reports-not-income-not-spending"
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginTop: 12, alignItems: 'flex-start' }]}
            >
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>NEITHER INCOME NOR SPENDING</Text>
              {borrowedTotal > 0 ? (
                <Text style={{ color: colors.foreground, marginTop: 6 }} testID="reports-borrowed">
                  Borrowed: <Text style={{ fontFamily: 'Inter_700Bold' }}>{formatKES(borrowedTotal)}</Text>
                </Text>
              ) : null}
              {repaidToUsTotal > 0 ? (
                <Text style={{ color: colors.foreground, marginTop: 2 }} testID="reports-repaid">
                  Paid back to you: <Text style={{ fontFamily: 'Inter_700Bold' }}>{formatKES(repaidToUsTotal)}</Text>
                </Text>
              ) : null}
              {lentTotal > 0 ? (
                <Text style={{ color: colors.foreground, marginTop: 2 }} testID="reports-lent">
                  Lent out: <Text style={{ fontFamily: 'Inter_700Bold' }}>{formatKES(lentTotal)}</Text>
                </Text>
              ) : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
                This money moved through the account without being earned or spent, so it is in none of the figures
                above. It is here because otherwise the balance changes for reasons this page never mentions.
              </Text>
            </View>
          ) : null}

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
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.utilisationLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                  BUDGET UTILISATION — {MONTHS_SHORT[month - 1]} {year}
                </Text>
                <Text style={[styles.utilisationPct, { color: isOverBudget ? '#ef4444' : colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
                  {budgetPct.toFixed(0)}% used
                </Text>
                {overBudgetCount > 0 && (
                  <Text style={{ color: '#ef4444', fontSize: 13, fontFamily: 'Inter_500Medium' }} testID="utilisation-over-count">
                    {overBudgetCount} {overBudgetCount === 1 ? 'category' : 'categories'} over
                  </Text>
                )}
              </View>
              <View style={styles.utilisationVariance}>
                <Feather
                  name={isOverBudget ? 'alert-circle' : 'check-circle'}
                  size={16}
                  color={isOverBudget ? '#ef4444' : '#22c55e'}
                />
                <Text style={[styles.utilisationVarText, { color: isOverBudget ? '#ef4444' : '#22c55e' }]} numberOfLines={1} adjustsFontSizeToFit>
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
          <View style={styles.section} onLayout={captureSection('income')}>
            <View style={styles.incomeStreamHeading}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Income Streams</Text>
                <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                  Expected income, recorded funding, and what remains this month
                </Text>
                {canManageCostCategories ? (
                  <Text style={[styles.sectionSub, { color: colors.mutedForeground, marginTop: 2 }]}>
                    Running a side hustle through one of these? Open it and link a cost category (like Stock) to see real profit, not just the sale amount.
                  </Text>
                ) : null}
              </View>
              {(incomeStreamReport?.streams.length ?? 0) > 0 ? (
                <Pressable onPress={toggleAllStreamDetails} accessibilityRole="button" hitSlop={8} testID="income-stream-details-all">
                  <Text style={[styles.streamDetailsLink, { color: colors.primary }]}>{allStreamsDetailed ? 'Hide all details' : 'Show all details'}</Text>
                </Pressable>
              ) : (
                <Feather name="pie-chart" size={19} color={colors.primary} />
              )}
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
                  const linkedCostCategories = unattributed
                    ? []
                    : categories.filter((category) => category.reducesIncomeSourceId === stream.incomeSourceId);
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
                      {stream.costs > 0 ? (
                        <Text style={[styles.variance, { color: colors.mutedForeground }]}>
                          {formatKES(stream.total + stream.costs)} sales − {formatKES(stream.costs)} {linkedCostCategories.map((category) => category.name).join(', ') || 'cost'} = {formatKES(stream.total)} profit
                        </Text>
                      ) : null}
                      {!unattributed && canManageCostCategories ? (
                        <Pressable
                          onPress={() => setCostCategoryFor({ incomeSourceId: stream.incomeSourceId!, sourceName: stream.sourceName })}
                          style={styles.costCategoryRow}
                          accessibilityRole="button"
                          testID={`income-stream-cost-category-${stream.incomeSourceId}`}
                        >
                          <Feather name="link-2" size={13} color={colors.mutedForeground} />
                          <Text style={[styles.variance, { color: colors.mutedForeground }]}>
                            {linkedCostCategories.length > 0
                              ? `Cost categor${linkedCostCategories.length === 1 ? 'y' : 'ies'}: ${linkedCostCategories.map((category) => category.name).join(', ')}`
                              : 'Link a cost category'}
                          </Text>
                        </Pressable>
                      ) : null}
                      {detailedStreams.has(streamKey(stream.incomeSourceId)) ? (
                        <View style={[styles.streamDetails, { borderColor: colors.border }]} testID={`income-stream-detail-list-${streamKey(stream.incomeSourceId)}`}>
                          {linkedCostCategories.length > 0 ? (
                            <>
                              <Text style={[styles.streamDetailsHead, { color: colors.mutedForeground }]}>COSTS THIS MONTH</Text>
                              {linkedCostCategories.map((category) => {
                                const spent = catBreakdown.find((row) => row.category === category.name)?.spentAmount ?? 0;
                                return (
                                  <View key={category.id} style={styles.streamDetailRow}>
                                    <Text style={[styles.variance, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                                      {category.name} · {category.costKind === 'expense' ? 'Expense' : 'Cost of goods sold'}
                                    </Text>
                                    <Text style={[styles.variance, { color: colors.foreground }]}>− {formatKES(spent)}</Text>
                                  </View>
                                );
                              })}
                            </>
                          ) : null}
                          <Text style={[styles.streamDetailsHead, { color: colors.mutedForeground }]}>RECEIVED THIS MONTH</Text>
                          {loadingIncomeLedger ? (
                            <ActivityIndicator color={colors.primary} style={{ marginVertical: 6 }} />
                          ) : (() => {
                            const entries = streamEntries(stream.incomeSourceId);
                            if (entries.length === 0) {
                              return <Text style={[styles.variance, { color: colors.mutedForeground }]}>Nothing received yet.</Text>;
                            }
                            return (
                              <>
                                {entries.slice(0, STREAM_DETAIL_ROWS).map((entry) => (
                                  <View key={entry.id} style={styles.streamDetailRow}>
                                    <Text style={[styles.variance, { color: colors.mutedForeground, width: 44 }]}>{entry.date.slice(8, 10)}/{entry.date.slice(5, 7)}</Text>
                                    <Text style={[styles.variance, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{entry.description}</Text>
                                    <Text style={[styles.variance, { color: colors.foreground }]}>{formatKES(entry.amount)}</Text>
                                  </View>
                                ))}
                                {entries.length > STREAM_DETAIL_ROWS ? (
                                  <Pressable onPress={() => router.push('/income-ledger')} accessibilityRole="button" hitSlop={6}>
                                    <Text style={[styles.variance, { color: colors.primary }]}>
                                      {entries.length - STREAM_DETAIL_ROWS} more · open All income
                                    </Text>
                                  </Pressable>
                                ) : null}
                              </>
                            );
                          })()}
                        </View>
                      ) : null}
                      <Pressable
                        onPress={() => toggleStreamDetails(streamKey(stream.incomeSourceId))}
                        accessibilityRole="button"
                        hitSlop={6}
                        style={{ marginTop: 6, alignSelf: 'flex-start' }}
                        testID={`income-stream-details-${streamKey(stream.incomeSourceId)}`}
                      >
                        <Text style={[styles.streamDetailsLink, { color: colors.primary }]}>
                          {detailedStreams.has(streamKey(stream.incomeSourceId)) ? 'Hide details' : 'Show details'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* ── Income trend ── */}
          <View style={styles.section} testID="income-trend-section">
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Income Trend</Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Per stream, last {incomeTrend?.months.length ?? 6} months
            </Text>
            {loadingIncomeTrend ? (
              <View style={[styles.incomeStreamStatus, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.incomeStreamStatusText, { color: colors.mutedForeground }]}>Loading the income trend…</Text>
              </View>
            ) : incomeTrendError ? (
              <Pressable
                onPress={() => refetchIncomeTrend()}
                testID="income-trend-retry"
                style={[styles.incomeStreamStatus, { backgroundColor: colors.card, borderColor: '#ef444455' }]}
              >
                <Feather name="alert-circle" size={18} color="#ef4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.incomeStreamStatusTitle, { color: colors.foreground }]}>Couldn’t load the income trend</Text>
                  <Text style={[styles.incomeStreamStatusText, { color: colors.mutedForeground }]}>Tap to try again.</Text>
                </View>
              </Pressable>
            ) : (incomeTrend?.streams.length ?? 0) === 0 ? (
              <View style={[styles.incomeStreamStatus, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="trending-up" size={18} color={colors.mutedForeground} />
                <Text style={[styles.incomeStreamStatusText, { color: colors.mutedForeground }]}>
                  No income streams recorded yet.
                </Text>
              </View>
            ) : (
              incomeTrend!.streams.map((stream) => {
                // A blank card for a stream nobody has funded yet reads as
                // broken rather than as "nothing here" — a bar floor instead
                // of a zero-height gap keeps the axis itself visible.
                const max = Math.max(1, ...stream.amounts);
                return (
                  <View
                    key={stream.incomeSourceId ?? 'unattributed'}
                    testID={`income-trend-stream-${stream.incomeSourceId ?? 'unattributed'}`}
                    style={[styles.incomeStreamCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.incomeTrendHeader}>
                      <Text style={[styles.incomeStreamName, { color: colors.foreground }]} numberOfLines={1}>
                        {stream.sourceName}
                      </Text>
                      <Text style={[styles.variance, { color: colors.mutedForeground }]}>
                        {formatKES(stream.total)} total
                      </Text>
                    </View>
                    <View style={styles.incomeTrendBars}>
                      {incomeTrend!.months.map((monthLabel, index) => {
                        const amount = stream.amounts[index];
                        const barH = amount > 0 ? Math.max(6, Math.round((amount / max) * 72)) : 2;
                        const isPeak = amount > 0 && amount === max;
                        return (
                          <View key={`${monthLabel.year}-${monthLabel.month}`} style={styles.trendBarCol}>
                            {isPeak ? (
                              <Text style={[styles.trendPeakLabel, { color: colors.primary }]}>{shortKES(amount)}</Text>
                            ) : null}
                            <View style={styles.trendBarWrap}>
                              <View
                                style={[
                                  styles.trendBar,
                                  { height: barH, backgroundColor: isPeak ? colors.primary : colors.primary + '55' },
                                ]}
                              />
                            </View>
                            <Text
                              style={[styles.trendDayNum, { color: isPeak ? colors.primary : colors.mutedForeground }]}
                              numberOfLines={1}
                            >
                              {monthLabel.label.split(' ')[0]}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
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
            <View style={styles.section} onLayout={captureSection('spending')}>
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
                const hue = idx === 0 ? colors.brandGold : colors.brandTeal;
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
                const icon = getCategoryIcon((e.category ?? '') as string);
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
              <Pressable
                testID="reports-create-first-expense"
                accessibilityRole="button"
                accessibilityLabel="Log an expense to start your report"
                onPress={() => router.push('/add-expense')}
                style={[styles.emptyAction, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={16} color={colors.primaryForeground} />
                <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Log first expense</Text>
              </Pressable>
            </View>
          )}
        </PageScrollView>
      )}

      <Modal
        visible={watchDetailsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setWatchDetailsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.detailsSheet, { backgroundColor: colors.card }]}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsTitleBlock}>
                <View style={[styles.detailsIcon, { backgroundColor: colors.destructive + '18' }]}>
                  <Feather name="alert-triangle" size={18} color={colors.destructive} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailsTitle, { color: colors.foreground }]}>Categories to watch</Text>
                  <Text style={[styles.detailsSubtitle, { color: colors.mutedForeground }]}>
                    {categoriesToWatch.length === 0
                      ? 'Nothing is over budget this month.'
                      : `${categoriesToWatch.length} ${categoriesToWatch.length === 1 ? 'category is' : 'categories are'} over budget.`}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close category details"
                onPress={() => setWatchDetailsOpen(false)}
                hitSlop={10}
                style={[styles.detailsCloseButton, { backgroundColor: colors.muted }]}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            {categoriesToWatch.length === 0 ? (
              <View style={styles.detailsEmpty}>
                <Feather name="check-circle" size={28} color={colors.primary} />
                <Text style={[styles.detailsEmptyText, { color: colors.mutedForeground }]}>
                  Keep going—your spending is within the category budgets you set.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.detailsList}
                contentContainerStyle={styles.detailsListContent}
                showsVerticalScrollIndicator={false}
              >
                {categoriesToWatch.map((item) => (
                  <View key={item.category} style={[styles.detailsRow, { borderColor: colors.border }]}>
                    <View style={[styles.catIcon, { backgroundColor: colors.destructive + '18' }]}>
                      <Feather
                        name={getCategoryIcon(item.category)}
                        size={15}
                        color={colors.destructive}
                      />
                    </View>
                    <View style={styles.detailsRowContent}>
                      <View style={styles.detailsRowTop}>
                        <Text style={[styles.detailsCategoryName, { color: colors.foreground }]} numberOfLines={1}>
                          {item.category}
                        </Text>
                        <Text style={[styles.detailsOverAmount, { color: colors.destructive }]}>
                          {formatKES(item.spentAmount - item.budgetAmount)} over
                        </Text>
                      </View>
                      <Text style={[styles.detailsRowMeta, { color: colors.mutedForeground }]}>
                        {formatKES(item.spentAmount)} spent of {formatKES(item.budgetAmount)} budget
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={pdfChooserOpen} transparent animationType="slide" onRequestClose={() => setPdfChooserOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.detailsSheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) + 4 }]} testID="report-pdf-sections">
            <Text style={[styles.detailsTitle, { color: colors.foreground }]}>What goes in the PDF</Text>
            <Text style={[styles.detailsSubtitle, { color: colors.mutedForeground, marginBottom: 10 }]}>
              {customDates
                ? `${longDay(orderedRange(dayFrom, dayTo)[0])} to ${longDay(orderedRange(dayFrom, dayTo)[1])}`
                : `${MONTHS[month - 1]} ${year}`}. Tick what you want; Jamvi remembers it for next time.
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
              {PDF_SECTIONS.filter((section) => section.key !== 'business' || hasBusiness).map((section) => {
                const on = pdfSections[section.key];
                return (
                  <Pressable
                    key={section.key}
                    onPress={() => togglePdfSection(section.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    testID={`report-include-${section.key}`}
                    style={[styles.pdfSectionOption, { borderColor: colors.border }]}
                  >
                    <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pdfSectionLabel, { color: colors.foreground }]}>{section.label}</Text>
                      <Text style={[styles.variance, { color: colors.mutedForeground }]}>{section.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {(() => {
              const chosen = PDF_SECTIONS.some((section) => pdfSections[section.key] && (section.key !== 'business' || hasBusiness));
              return (
                <Pressable
                  onPress={() => { setPdfChooserOpen(false); void exportPdf(); }}
                  disabled={!chosen || isExporting}
                  accessibilityRole="button"
                  testID="report-pdf-download"
                  style={{ marginTop: 14, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary, opacity: chosen ? 1 : 0.5 }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                    {chosen ? 'Download PDF' : 'Tick at least one'}
                  </Text>
                </Pressable>
              );
            })()}
            <Pressable onPress={() => setPdfChooserOpen(false)} accessibilityRole="button" style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={costCategoryFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setCostCategoryFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.detailsSheet, { backgroundColor: colors.card }]}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsTitleBlock}>
                <View style={[styles.detailsIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name="link-2" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailsTitle, { color: colors.foreground }]}>Cost categories</Text>
                  <Text style={[styles.detailsSubtitle, { color: colors.mutedForeground }]}>
                    Spending tagged to any category checked below is worked out of {costCategoryFor?.sourceName ?? 'this stream'}&rsquo;s profit every month. Check as many as apply, and say whether each is a cost of goods sold (stock, fuel) or a running expense (repairs, rent).
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setCostCategoryFor(null)}
                hitSlop={10}
                style={[styles.detailsCloseButton, { backgroundColor: colors.muted }]}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.detailsList}
              contentContainerStyle={[styles.detailsListContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.variance, { color: colors.mutedForeground, marginBottom: 8 }]}>
                Only categories without sub-categories of their own are listed — a category holding sub-categories carries no spending itself, so link each sub-category separately.
              </Text>
              {categories
                .filter((category) => !categories.some((other) => other.parentId === category.id))
                .map((category) => {
                  const linkedTo = costLinkOf(category);
                  const selected = linkedTo === costCategoryFor?.incomeSourceId;
                  const linkedElsewhere = linkedTo != null && !selected;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => toggleCostCategory(category)}
                      style={[
                        styles.costCategoryOption,
                        { borderColor: colors.border },
                        selected && { backgroundColor: `${colors.primary}18` },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      testID={`cost-category-${category.id}`}
                    >
                      <Text style={{ color: colors.foreground, fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>
                        {category.name}{selected ? '  ✓' : ''}
                      </Text>
                      {linkedElsewhere ? (
                        <Text style={[styles.variance, { color: colors.mutedForeground }]}>Reduces another stream — tap to move it here</Text>
                      ) : null}
                      {selected ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }} testID={`cost-kind-${category.id}`}>
                          {([
                            ['cogs', 'Cost of goods sold'],
                            ['expense', 'Expense'],
                          ] as const).map(([kind, label]) => {
                            const on = costKindOf(category) === kind;
                            return (
                              <Pressable
                                key={kind}
                                onPress={() => { if (!on) void applyCostKind(category.id, kind); }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${category.name} is ${label}`}
                                testID={`cost-kind-${category.id}-${kind}`}
                                style={{
                                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                                  borderColor: on ? colors.primary : colors.border,
                                  backgroundColor: on ? colors.primary : 'transparent',
                                }}
                              >
                                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: on ? colors.primaryForeground : colors.foreground }}>{label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
            </ScrollView>
            {/* Each tick saves as it is tapped; this only says the job is done,
                which a sheet with no button at the foot never did. */}
            <Pressable
              onPress={() => setCostCategoryFor(null)}
              accessibilityRole="button"
              style={{ margin: 16, marginBottom: Math.max(insets.bottom, 16), borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary }}
              testID="cost-categories-done"
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>
                {Object.keys(pendingCost).length > 0 ? 'Saving…' : 'Done'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  pdfButtonText: { color: '#011C4E', fontSize: 12, fontFamily: 'Inter_700Bold' },
  pdfError: { color: '#fee2e2', fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 17 },
  // The range controls sit on the navy header gradient, so they are drawn in
  // white on translucent white rather than the usual card tokens.
  customDatesToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 32, alignSelf: 'flex-start' },
  customDatesToggleText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pdfSectionOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  pdfSectionLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  dayField: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dayLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter_500Medium' },
  dayValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  dayValue: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  monthPicker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  monthArrow: { padding: 4 },
  monthArrowDisabled: { opacity: 0.4 },
  monthLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#fff', minWidth: 140, textAlign: 'center' },

  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12 },

  // Plain-language monthly progress
  progressCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  progressHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  progressEyebrow: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  progressTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  progressTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  progressMonth: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  progressMessageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressMessage: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  netBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  netBannerLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  netBannerAmount: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  progressStats: { flexDirection: 'row', gap: 8 },
  progressStat: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10 },
  progressStatPressed: { opacity: 0.72 },
  progressStatHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  progressStatLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  progressStatAmount: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 4 },
  progressStatSub: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Summary cards (3 across)
  cardsRow: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  cardLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5 },
  cardAmount: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 1 },
  cardSub: { fontSize: 10, fontFamily: 'Inter_400Regular' },

  // Overall utilisation card
  utilisationCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  utilisationTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  utilisationLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  utilisationPct: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  utilisationVariance: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '45%' },
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
  spendOnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  spendOnTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  spendOnSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
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
  costCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  streamDetailsLink: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  streamDetails: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  streamDetailsHead: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6, marginTop: 4 },
  streamDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // A column: the name, then its kind buttons on a line of their own. In a row
  // a long name ('Transport for side hustle') pushed Expense off the card.
  costCategoryOption: { flexDirection: 'column', alignItems: 'stretch', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  incomeTrendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  incomeTrendBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },

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
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 2 },
  emptyActionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Category details sheet
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  detailsSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '78%' },
  detailsHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  detailsTitleBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailsIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  detailsTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  detailsSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  detailsCloseButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  detailsList: { flexGrow: 0 },
  detailsListContent: { gap: 8, paddingBottom: 4 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 11 },
  detailsRowContent: { flex: 1, gap: 3 },
  detailsRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailsCategoryName: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  detailsOverAmount: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  detailsRowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  detailsEmpty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24 },
  detailsEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' },
});
