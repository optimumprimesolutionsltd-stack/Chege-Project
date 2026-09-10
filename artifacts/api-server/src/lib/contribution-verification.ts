import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short, unguessable code that stands for one group's contribution record.
 *
 * A treasurer's report is a plain PDF or a chat message — either can be edited
 * before it is forwarded. The code goes on the report and points at a public,
 * read-only page that shows the same figures straight from the group's data, so
 * anyone who receives the report can check it against the source.
 *
 * The code is derived, not stored: it is the group id together with a keyed
 * hash of it, so a valid code cannot be produced for an arbitrary group without
 * the key, and nothing has to be migrated or cleaned up. Rotating the key (set
 * REPORT_VERIFY_SECRET) invalidates every code already in circulation.
 */
function verifyKey(): string {
  return (
    process.env.REPORT_VERIFY_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "jamvi-report-verify-dev-key"
  );
}

function signature(groupId: number): string {
  return createHmac("sha256", verifyKey()).update(`contribution-report:${groupId}`).digest("hex").slice(0, 10);
}

/** e.g. group 42 -> "1G-4f9a2c1b7d". */
export function groupVerifyCode(groupId: number): string {
  return `${groupId.toString(36)}-${signature(groupId)}`;
}

/** The group id a code stands for, or null if it is malformed or not genuine. */
export function resolveVerifyCode(code: string): number | null {
  const match = /^([0-9a-z]+)-([0-9a-f]{10})$/i.exec(code.trim());
  if (!match) return null;

  const groupId = parseInt(match[1], 36);
  if (!Number.isInteger(groupId) || groupId <= 0) return null;

  const expected = Buffer.from(signature(groupId));
  const given = Buffer.from(match[2].toLowerCase());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  return groupId;
}
