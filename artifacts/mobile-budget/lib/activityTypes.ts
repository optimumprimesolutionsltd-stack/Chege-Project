/**
 * Canonical activity-item type strings used by the dashboard activity feed.
 * Both the API (dashboard.ts) and all client consumers must reference these
 * constants so a rename in one place is caught by TypeScript everywhere else.
 */
export const ACTIVITY_TYPE = {
  EXPENSE: 'expense',
  CONTRIBUTION: 'contribution',
  SAVINGS: 'savings',
  /** Money moved between two of the group's own accounts. Neither in nor out. */
  TRANSFER: 'transfer',
  /** Borrowed, lent or settled. Not spending and not a contribution. */
  DEBT: 'debt',
} as const;

export type ActivityType = (typeof ACTIVITY_TYPE)[keyof typeof ACTIVITY_TYPE];
