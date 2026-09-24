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
  /** The reduced tab bar: the main four, and everything else under More. */
  simple: boolean;
  isShared: boolean;
  showBudget: boolean;
  showDebt: boolean;
  showReports: boolean;
};

/**
 * Which tabs are on the bar.
 *
 * The full bar grew to seven tabs. A newcomer, or a child, cannot tell which of
 * seven matter, so Simple view keeps four (Home, Activity, Budget when the
 * budget is on, Goals) and puts the rest one tap away under More, where each
 * one is explained in a sentence. Nothing is removed: every screen is still
 * reachable, from the same place it always was.
 */
export function visibleTabs(flags: TabFlags): TabName[] {
  const { simple, isShared, showBudget, showDebt, showReports } = flags;
  if (simple) {
    return [
      'index',
      'history',
      ...(showBudget ? (['budget'] as const) : []),
      'goals',
      'more',
    ];
  }
  return [
    'index',
    'history',
    ...(showBudget ? (['budget'] as const) : []),
    ...(isShared ? (['contributions'] as const) : []),
    'goals',
    ...(!isShared ? (['search'] as const) : []),
    ...(showReports ? (['reports'] as const) : []),
    ...(showDebt ? (['debt'] as const) : []),
  ];
}
