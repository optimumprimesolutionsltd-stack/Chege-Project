import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppearance } from '@/hooks/useAppearance';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlobalFAB } from '@/components/GlobalFAB';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { useGetGroup } from '@workspace/api-client-react';

// iOS 26+: NativeTabs with liquid glass support
// 5 core tabs — Bank and Settings remain accessible from Home/header controls.
// A shared group swaps Search out for Contributions, which is a core shared
// activity; Search stays reachable from the Home header.
function NativeTabLayout({ showReports, isShared, showDebt, showBudget }: { showReports: boolean; isShared: boolean; showDebt: boolean; showBudget: boolean }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <Label>Activity</Label>
      </NativeTabs.Trigger>
{showBudget && (
              <NativeTabs.Trigger name="budget">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>Budget</Label>
      </NativeTabs.Trigger>
      )}
      {isShared && (
        <NativeTabs.Trigger name="contributions">
          <Icon sf={{ default: 'arrow.down.circle', selected: 'arrow.down.circle.fill' }} />
          <Label>Contributions</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="goals">
        <Icon sf={{ default: 'target', selected: 'target' }} />
        <Label>Goals</Label>
      </NativeTabs.Trigger>
      {!isShared && (
        <NativeTabs.Trigger name="search">
          <Icon sf={{ default: 'magnifyingglass', selected: 'magnifyingglass' }} />
          <Label>Search</Label>
        </NativeTabs.Trigger>
      )}
      {showReports && (
        <NativeTabs.Trigger name="reports">
          <Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} />
          <Label>Reports</Label>
        </NativeTabs.Trigger>
      )}
      {showDebt && (
        <NativeTabs.Trigger name="debt">
          <Icon sf={{ default: 'chart.line.downtrend.xyaxis', selected: 'chart.line.downtrend.xyaxis' }} />
          <Label>Debt</Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

function ClassicTabLayout({ showReports, isShared, showDebt, showBudget }: { showReports: boolean; isShared: boolean; showDebt: boolean; showBudget: boolean }) {
  const colors = useColors();
  const { resolvedScheme } = useAppearance();
  const isDark = resolvedScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontSize: 10 },
        tabBarStyle: {
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: safeAreaInsets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                  {
                    backgroundColor: colors.card,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  },
              ]}
            />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
            ),
      }}
    >
      {/* ── 5 visible tabs ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house.fill" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="clock.fill" tintColor={color} size={24} />
            ) : (
              <Feather name="activity" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={showBudget
          ? {
              title: 'Budget',
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="chart.bar.fill" tintColor={color} size={24} />
                ) : (
                  <Feather name="bar-chart-2" size={22} color={color} />
                ),
            }
          : { href: null }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="target" tintColor={color} size={24} />
            ) : (
              <Feather name="target" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={
          isShared
            ? { href: null }
            : {
                title: 'Search',
                tabBarIcon: ({ color }) =>
                  isIOS ? (
                    <SymbolView name="magnifyingglass" tintColor={color} size={24} />
                  ) : (
                    <Feather name="search" size={22} color={color} />
                  ),
              }
        }
      />
      <Tabs.Screen
        name="reports"
        options={showReports
          ? {
              title: 'Reports',
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="chart.pie.fill" tintColor={color} size={24} />
                ) : (
                  <Feather name="pie-chart" size={22} color={color} />
                ),
            }
          : { href: null }}
      />
      <Tabs.Screen
        name="contributions"
        options={
          isShared
            ? {
                title: 'Contributions',
                tabBarIcon: ({ color }) =>
                  isIOS ? (
                    <SymbolView name="arrow.down.circle.fill" tintColor={color} size={24} />
                  ) : (
                    <Feather name="download" size={22} color={color} />
                  ),
              }
            : { href: null }
        }
      />

      <Tabs.Screen
        name="debt"
        options={showDebt
          ? {
              title: 'Debt',
              tabBarIcon: ({ color }) =>
                isIOS ? (
                  <SymbolView name="chart.line.downtrend.xyaxis" tintColor={color} size={24} />
                ) : (
                  <Feather name="trending-down" size={22} color={color} />
                ),
            }
          : { href: null }}
      />

      {/* ── Hidden — accessible via Home/header controls ── */}
      <Tabs.Screen name="bank"     options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const { data: group } = useGetGroup();
  const showReports = group?.isPrivate !== false;
  // Debt earns its tab rather than being handed one. A budget that tracks no
  // debt gets no tab — an empty Debt tab on every household's phone would be
  // the opposite of making debt matter — and the moment a category is marked
  // as a debt, it appears.
  const { data: debtCategories = [] } = useQuery<Array<{ debtBalance: number | null; budgetAmount?: number | null }>>({
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<Array<{ debtBalance: number | null; budgetAmount?: number | null }>>('/api/budget-categories'),
    staleTime: 60_000,
  });
  // Somebody you owe is a debt whether or not a category was ever marked as
  // one. Creditors could be recorded all day — a lender named while borrowing,
  // a party given an opening balance — and the tab stayed away, because it
  // only ever looked at categories.
  const { data: debtParties = [] } = useQuery<Array<{ owedByUs?: number | null }>>({
    queryKey: ['parties'],
    queryFn: () => customFetch<Array<{ owedByUs?: number | null }>>('/api/contributors'),
    staleTime: 60_000,
  });
  const showDebt =
    debtCategories.some((row) => row.debtBalance !== null && row.debtBalance !== undefined) ||
    debtParties.some((party) => typeof party.owedByUs === 'number');
  // Budgeting is off for a budget whose purpose is saving or clearing a debt,
  // because a budget of zeros reads as "KES 0 of KES 0 (0%)" everywhere and
  // makes the app look broken. It is not off forever: the moment any category
  // carries a real amount, the tab comes back on its own, so nobody has to
  // find a setting to undo an answer they gave before they knew what the app
  // did. `enabledSections` is what the budget itself says; a real amount
  // overrides it, never the other way round.
  const hasBudgetedAmount = debtCategories.some((row) => Number((row as { budgetAmount?: number | null }).budgetAmount ?? 0) > 0);
  // An empty or absent list means "everything", which is what every budget
  // made before sections existed carries.
  const sections = group?.enabledSections;
  const budgetSectionOn = !Array.isArray(sections) || sections.length === 0 || sections.includes('budget');
  const showBudget = budgetSectionOn || hasBudgetedAmount;
  const isShared = group?.isPrivate === false;
  // The shared and personal layouts have a different set of tabs (Contributions
  // vs Search). A native tab bar does not reliably add or drop a trigger when
  // this flips after the group query resolves, so remount the navigator on the
  // change instead of mutating its children in place.
  // showDebt belongs in the key for the same reason isShared does: the native
  // tab bar does not reliably grow a trigger when the set changes, so marking
  // the first category as a debt has to remount the navigator for the tab to
  // actually appear.
  const layoutKey = `${group === undefined ? 'loading' : isShared ? 'shared' : 'personal'}-${showDebt ? 'debt' : 'nodebt'}-${showBudget ? 'budget' : 'nobudget'}`;

  // SubscriptionBanner sits above the navigator, not inside either tab
  // layout, so it is on screen no matter which tab is active — an in-flow
  // sibling that takes its own height and leaves the rest to the navigator,
  // rather than an absolute overlay like GlobalFAB: a top status strip should
  // push screen content down, not float over each screen's own header.
  if (isLiquidGlassAvailable()) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.card }}>
        <SubscriptionBanner />
        <View style={{ flex: 1 }}>
          <NativeTabLayout key={layoutKey} showReports={showReports} isShared={isShared} showDebt={showDebt} showBudget={showBudget} />
        </View>
        <GlobalFAB />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <SubscriptionBanner />
      <View style={{ flex: 1 }}>
        <ClassicTabLayout key={layoutKey} showReports={showReports} isShared={isShared} showDebt={showDebt} showBudget={showBudget} />
      </View>
      <GlobalFAB />
    </View>
  );
}
