import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TabSwitchProvider } from '@/components/TabSwitch';
import { useTabFlags } from '@/hooks/useTabFlags';
import BudgetScreen from './budget';
import ContributionsScreen from './contributions';
import ReportsScreen from './reports';

/**
 * Plan: what you meant to spend and what happened, in one tab - Budget or
 * Reports, chosen at the top; a shared group's Contributions come first.
 * They were separate tabs ("the tab thing with banks reports etc is
 * exhausting", 15 Oct 2026). The screens are unchanged and still open on
 * their own for every link that goes to them.
 */
export default function PlanScreen() {
  const { isShared, showBudget, showReports } = useTabFlags();
  const { view: askedView } = useLocalSearchParams<{ view?: string }>();
  // Reports first in a Personal budget: "i think we can change the tab at the
  // footer with reports tab" (16 Oct 2026). In a chama, Contributions first -
  // who has paid is what every member opens it for - and the tab is called
  // that; Reports and the Budget are one tap away at the top.
  const options = useMemo(() => [
    ...(isShared ? [{ key: 'contributions', label: 'Contributions' }] : []),
    ...(showReports ? [{ key: 'reports', label: 'Reports' }] : []),
    ...(showBudget ? [{ key: 'budget', label: 'Budget' }] : []),
  ], [isShared, showBudget, showReports]);
  const [view, setView] = useState(askedView ?? '');
  // The first one there, until one is picked; a choice that went away falls back.
  const shown = options.some((option) => option.key === view) ? view : options[0]?.key ?? 'reports';
  useEffect(() => {
    if (askedView && options.some((option) => option.key === askedView)) setView(askedView);
  }, [askedView, options]);
  return (
    <TabSwitchProvider value={{ options, value: shown, onChange: setView }}>
      {shown === 'contributions' ? <ContributionsScreen /> : shown === 'budget' ? <BudgetScreen /> : <ReportsScreen />}
    </TabSwitchProvider>
  );
}
