import { AUTH_PROVIDER } from "./auth";
import { assertPhotoStorageConfiguration } from "./photoStorage";

function required(key: string, missing: string[]): void {
  if (!process.env[key]?.trim()) missing.push(key);
}

function httpsOrigin(key: "APP_ORIGIN" | "APP_URL"): string {
  const raw = process.env[key]?.trim();
  if (!raw) return "";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${key} must be an absolute HTTPS URL.`);
  }

  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${key} must be an HTTPS origin without a path, query, or hash.`,
    );
  }
  return url.origin;
}

/**
 * Replit development and Replit-published deployments retain their existing
 * managed configuration. External production hosts must declare every
 * dependency needed for sign-in, private photos, invitations, and digests.
 */
export function assertExternalProductionConfiguration(): void {
  if (process.env.NODE_ENV !== "production" || process.env.REPL_ID) return;

  const missing: string[] = [];
  for (const key of [
    "APP_ORIGIN",
    "APP_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "RESEND_API_KEY",
    "INVITATION_FROM_EMAIL",
    "DIGEST_FROM_EMAIL",
  ]) {
    required(key, missing);
  }

  if (missing.length > 0) {
    throw new Error(
      `External production configuration is incomplete. Set: ${missing.join(", ")}.`,
    );
  }

  if (AUTH_PROVIDER !== "google") {
    throw new Error(
      "External production must use Google OAuth. Set AUTH_PROVIDER=google and configure Google OAuth credentials.",
    );
  }

  const appOrigin = httpsOrigin("APP_ORIGIN");
  const appUrl = httpsOrigin("APP_URL");
  if (appOrigin !== appUrl) {
    throw new Error(
      "APP_ORIGIN and APP_URL must use the same public HTTPS origin.",
    );
  }

  assertPhotoStorageConfiguration();
}
