export type TabName =
  | 'index'
  | 'history'
  | 'budget'
  | 'goals'
  | 'search'
  | 'reports'
  | 'contributions'
  | 'debt'
  | 'more';

export type TabFlags = {
  isShared: boolean;
  showBudget: boolean;
  showDebt: boolean;
  showReports: boolean;
};

/**
 * Which tabs are on the bar: five, for everybody.
 *
 * The full bar had grown to eight (Home, Activity, Budget, Goals, Search,
 * Reports, Debt, More), too many for a phone and confusing for anyone new.
 * "Cut the bar to 5 tabs: Home, Activity, Budget, Reports, More" (10 Oct 2026),
 * Reports on it because Reports is where a person lives once the M-Pesa reading
 * does the filing. A shared group's third tab is Contributions, which is what a
 * group checks most; its Budget is under More.
 *
 * Nothing is removed: Goals, Search, Debt, Bank and Settings are under More,
 * every route still works, and Search is also an icon in Activity and Budget.
 * Budget and Reports still follow the person's Settings switches.
 */
export function visibleTabs(flags: TabFlags): TabName[] {
  const { isShared, showBudget, showReports } = flags;
  return [
    'index',
    'history',
    ...(isShared ? (['contributions'] as const) : showBudget ? (['budget'] as const) : []),
    ...(showReports ? (['reports'] as const) : []),
    'more',
  ];
}
