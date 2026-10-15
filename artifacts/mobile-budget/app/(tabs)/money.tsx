import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TabSwitchProvider } from '@/components/TabSwitch';
import BankScreen from './bank';
import HistoryScreen from './history';

/**
 * Money: every shilling in and out, in one tab - your accounts (what Bank was)
 * or all activity, chosen at the top. Bank and Activity were two tabs showing
 * the same money two ways ("the tab thing with banks reports etc is
 * exhausting", 15 Oct 2026). Both screens are unchanged; /(tabs)/bank and
 * /(tabs)/history still open on their own for every link that goes there.
 */
const OPTIONS = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'activity', label: 'All activity' },
];

export default function MoneyScreen() {
  const { view: askedView } = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState(askedView === 'activity' ? 'activity' : 'accounts');
  useEffect(() => {
    if (askedView === 'activity' || askedView === 'accounts') setView(askedView);
  }, [askedView]);
  return (
    <TabSwitchProvider value={{ options: OPTIONS, value: view, onChange: setView }}>
      {view === 'activity' ? <HistoryScreen /> : <BankScreen />}
    </TabSwitchProvider>
  );
}
