export function shouldShowBudgetChooser({
  pathname,
  basePath,
  completed,
}: {
  pathname: string;
  basePath: string;
  completed: boolean;
}): boolean {
  if (completed) return false;

  const base = basePath.replace(/\/$/, "");
  const appPath = base && pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length)
    : pathname;

  return !/^\/(?:invite|join)\/[^/]+\/?$/.test(appPath);
}