export type TabName =
  | 'index'
  | 'money'
  | 'plan'
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
 * Which tabs are on the bar: three, for everybody - Home, Money, Reports
 * (the route is still `plan`).
 *
 * Five (Home, Activity, Budget, Reports, More) with a four-button bar floating
 * above them was still nine buttons, Budget twice: "the tab thing with banks
 * reports etc is exhausting" (15 Oct 2026). Money holds your accounts and all
 * activity, Reports opens on Reports with a group's Contributions and the
 * Budget beside it (16 Oct 2026: "change the tab at the footer with reports"),
 * each chosen at the top of the tab (components/TabSwitch). Everything under
 * More is behind your picture on Home, and one + adds anything.
 *
 * Nothing is removed: every screen is still a route, reached from Money, Reports,
 * your picture, the + and the links that went there before.
 */
export function visibleTabs(_flags: TabFlags): TabName[] {
  return ['index', 'money', 'plan'];
}
