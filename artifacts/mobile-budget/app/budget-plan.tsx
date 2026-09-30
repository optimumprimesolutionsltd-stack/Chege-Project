import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  getDashboardMonthlyReportPdf,
  getGetDashboardCategoryBreakdownQueryKey,
  useGetDashboardCategoryBreakdown,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { writePdf } from '@/lib/savePdf';
import { budgetPlan, type PlanRow } from '@/lib/budgetPlan';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;

/**
 * The budget as planned, and nothing else: each heading, what sits under it
 * and how much is budgeted, with the total. The Budget report sets it against
 * what was spent; this is the plan to read, share or print on its own.
 */
export default function BudgetPlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [exporting, setExporting] = useState(false);

  const params = { month, year };
  const { data, isLoading, isError, refetch } = useGetDashboardCategoryBreakdown(params, {
    query: { queryKey: getGetDashboardCategoryBreakdownQueryKey(params) },
  });
  const plan = useMemo(() => budgetPlan((data ?? []) as unknown as PlanRow[]), [data]);

  const step = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };

  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await getDashboardMonthlyReportPdf(
        { month, year, includeSummary: false, includeBudget: false, includeIncome: false, includeBudgetPlan: true },
        { responseType: 'blob', cache: 'no-store' },
      );
      const file = await writePdf(Paths.cache, `jamvi-budget-plan-${year}-${String(month).padStart(2, '0')}.pdf`, blob as Blob);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share the budget plan', UTI: 'com.adobe.pdf' });
    } catch (error: unknown) {
      Alert.alert('Could not make the PDF', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" testID="budget-plan-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Budget plan</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>What you have budgeted for</Text>
        </View>
        <Pressable
          onPress={() => void downloadPdf()}
          disabled={exporting || isLoading}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Download the budget plan as PDF"
          testID="budget-plan-pdf"
          style={[styles.pdfButton, { borderColor: colors.border, opacity: exporting ? 0.6 : 1 }]}
        >
          {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={15} color={colors.primary} />}
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>PDF</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" testID="budget-plan-prev">
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.month, { color: colors.foreground }]}>{MONTHS[month - 1]} {year}</Text>
          <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" testID="budget-plan-next">
            <Feather name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {isError ? (
          <Pressable onPress={() => refetch()} style={[styles.note, { borderColor: colors.border }]} accessibilityRole="button" testID="budget-plan-retry">
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Couldn’t load this. Tap to retry.</Text>
          </Pressable>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : plan.headings.length === 0 ? (
          <View style={[styles.note, { borderColor: colors.border }]}>
            <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Nothing is budgeted for this month yet.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.total, { backgroundColor: colors.muted, borderColor: colors.border }]} testID="budget-plan-total">
              <Text style={[styles.totalValue, { color: colors.foreground }]}>{kes(plan.householdTotal)}</Text>
              <Text style={[styles.totalCaption, { color: colors.mutedForeground }]}>
                budgeted for {MONTHS[month - 1]} across {plan.headings.filter((heading) => !heading.business).length} headings
              </Text>
              {plan.businessTotal > 0 ? (
                <Text style={[styles.totalCaption, { color: colors.mutedForeground }]}>
                  + {kes(plan.businessTotal)} for income-stream costs, budgeted apart
                </Text>
              ) : null}
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {plan.headings.map((heading, index) => (
                <View key={heading.name} style={[styles.heading, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} testID={`budget-plan-heading-${heading.name}`}>
                  <View style={styles.line}>
                    <Text style={[styles.headingName, { color: colors.foreground }]} numberOfLines={1}>
                      {heading.name}{heading.business ? ' · income stream' : ''}
                    </Text>
                    <Text style={[styles.headingAmount, { color: colors.foreground }]}>{kes(heading.budget)}</Text>
                  </View>
                  {heading.children.map((child) => (
                    <View key={child.name} style={[styles.line, styles.child]}>
                      <Text style={[styles.childName, { color: colors.mutedForeground }]} numberOfLines={1}>{child.name}</Text>
                      <Text style={[styles.childAmount, { color: colors.mutedForeground }]}>{kes(child.budget)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  body: { padding: 16, gap: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  total: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 2 },
  totalValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  totalCaption: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  heading: { paddingVertical: 11, gap: 5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  child: { paddingLeft: 14 },
  headingName: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  headingAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  childName: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'Inter_400Regular' },
  childAmount: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  note: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  noteText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
