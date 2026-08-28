export function shouldShowBudgetChooser({
  pathname,
  basePath,
  completed,
  requiresSelection = false,
}: {
  pathname: string;
  basePath: string;
  completed: boolean;
  /** The server rejected the current workspace, so the user must choose or create one. */
  requiresSelection?: boolean;
}): boolean {
  const base = basePath.replace(/\/$/, "");
  const appPath = base && pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length)
    : pathname;

  if (/^\/(?:invite|join)\/[^/]+\/?$/.test(appPath)) return false;
  return requiresSelection || !completed;
}