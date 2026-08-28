/** Convert Vite's BASE_URL into a pathname prefix (empty when served at root). */
export function basePath(baseUrl: string): string {
  if (!baseUrl || baseUrl === "/") return "";
  return `/${baseUrl.replace(/^\/+|\/+$/g, "")}`;
}

/** Build a browser pathname for an application route, including the Vite base. */
export function appPath(route: string, baseUrl: string): string {
  const base = basePath(baseUrl);
  const normalizedRoute = route === "/" ? "/" : `/${route.replace(/^\/+/, "")}`;
  return `${base}${normalizedRoute}`;
}

/**
 * Return an application's route-relative pathname, or null when pathname is
 * outside the configured application base.
 */
export function routePath(pathname: string, baseUrl: string): string | null {
  const base = basePath(baseUrl);
  if (!base) return pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (pathname === base || pathname === `${base}/`) return "/";
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : null;
}