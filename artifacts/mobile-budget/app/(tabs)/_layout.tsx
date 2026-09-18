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
function NativeTabLayout({ showReports, isShared, showDebt }: { showReports: boolean; isShared: boolean; showDebt: boolean }) {
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
      <NativeTabs.Trigger name="budget">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>Budget</Label>
      </NativeTabs.Trigger>
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

function ClassicTabLayout({ showReports, isShared, showDebt }: { showReports: boolean; isShared: boolean; showDebt: boolean }) {
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
        options={{
          title: 'Budget',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="chart.bar.fill" tintColor={color} size={24} />
            ) : (
              <Feather name="bar-chart-2" size={22} color={color} />
            ),
        }}
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
  const { data: debtCategories = [] } = useQuery<Array<{ debtBalance: number | null }>>({
    queryKey: ['budget-categories-full'],
    queryFn: () => customFetch<Array<{ debtBalance: number | null }>>('/api/budget-categories'),
    staleTime: 60_000,
  });
  const showDebt = debtCategories.some((row) => row.debtBalance !== null && row.debtBalance !== undefined);
  const isShared = group?.isPrivate === false;
  // The shared and personal layouts have a different set of tabs (Contributions
  // vs Search). A native tab bar does not reliably add or drop a trigger when
  // this flips after the group query resolves, so remount the navigator on the
  // change instead of mutating its children in place.
  // showDebt belongs in the key for the same reason isShared does: the native
  // tab bar does not reliably grow a trigger when the set changes, so marking
  // the first category as a debt has to remount the navigator for the tab to
  // actually appear.
  const layoutKey = `${group === undefined ? 'loading' : isShared ? 'shared' : 'personal'}-${showDebt ? 'debt' : 'nodebt'}`;

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
          <NativeTabLayout key={layoutKey} showReports={showReports} isShared={isShared} showDebt={showDebt} />
        </View>
        <GlobalFAB />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <SubscriptionBanner />
      <View style={{ flex: 1 }}>
        <ClassicTabLayout key={layoutKey} showReports={showReports} isShared={isShared} showDebt={showDebt} />
      </View>
      <GlobalFAB />
    </View>
  );
}
