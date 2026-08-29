/**
 * Which public origin a request arrived on.
 *
 * The OAuth callback and the session cookie must both belong to the origin the
 * user actually loaded, because Google redirects the browser straight to the
 * callback without passing back through any proxy. So this cannot simply read
 * the Host header: when a separate frontend host proxies /api here, the request
 * headers describe this server rather than the address the user is on.
 * APP_ORIGIN pins it for that case.
 *
 * A Host header is attacker-controlled, so an unrecognised one is never
 * honoured — otherwise a forged header could point the OAuth callback at a
 * host someone else owns. ADDITIONAL_ORIGINS names the extra hostnames this
 * deployment genuinely answers on, and only those are accepted from the
 * request. That is what lets one service serve both a custom domain and its
 * generated hostname, each completing its own sign-in.
 */

type Headers = Record<string, string | string[] | undefined>;

/** First value of a header: express may give an array, chained proxies append. */
function headerValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.split(",")[0]?.trim() || undefined;
}

function trimOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Hostnames beyond APP_ORIGIN that this deployment also answers on. */
export function additionalOrigins(): string[] {
  return (process.env.ADDITIONAL_ORIGINS ?? "")
    .split(",")
    .map(trimOrigin)
    .filter(Boolean);
}

export function resolveOrigin(headers: Headers): string {
  const proto = headerValue(headers["x-forwarded-proto"]) ?? "https";
  const host =
    headerValue(headers["x-forwarded-host"]) ??
    headerValue(headers["host"]) ??
    "localhost";
  const fromRequest = `${proto}://${host}`;

  if (additionalOrigins().includes(fromRequest)) return fromRequest;

  const configured = process.env.APP_ORIGIN;
  if (configured?.trim()) return trimOrigin(configured);

  return fromRequest;
}
