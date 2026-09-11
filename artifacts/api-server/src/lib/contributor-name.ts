/**
 * What a person in the ledger has to be called.
 *
 * A contributor row is the only thing standing between money and the wrong
 * member. Names are deliberately not unique - two people really can both be
 * called John Kamau, and refusing the second is worse than showing both - but
 * a bare "John" is not a record of anybody. In a chama of forty it cannot be
 * told from the next John, and the treasurer reconciling a statement six
 * months later has no way back to the person who actually paid.
 *
 * So: at least two name parts. Not a guess at first/middle/surname, which no
 * single rule survives across Kenyan, Somali, Indian and European naming, but
 * the weaker claim that one word alone does not identify a person.
 */

/** The name as it should be stored: trimmed, with runs of whitespace collapsed
 *  so "Jane   Wanjiku" and "Jane Wanjiku" are the same person. */
export function normalizeContributorName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** The parts of a name that could identify somebody. Punctuation-only tokens
 *  ("J.", "-") are not parts, so "John ." stays a single name. */
function nameParts(name: string): string[] {
  return name.split(" ").filter((part) => /\p{L}/u.test(part));
}

export type ContributorNameProblem = "empty" | "too-long" | "single-name";

export const CONTRIBUTOR_NAME_MAX = 120;

/** What is wrong with this name, or null when it is usable. */
export function contributorNameProblem(raw: string): ContributorNameProblem | null {
  const name = normalizeContributorName(raw);
  if (name.length === 0) return "empty";
  if (name.length > CONTRIBUTOR_NAME_MAX) return "too-long";
  if (nameParts(name).length < 2) return "single-name";
  return null;
}

/** What to tell somebody who typed it. Written for a treasurer at a meeting,
 *  not for a developer reading a log. */
export function contributorNameMessage(problem: ContributorNameProblem): string {
  switch (problem) {
    case "empty":
      return "Enter the person's name.";
    case "too-long":
      return `Use ${CONTRIBUTOR_NAME_MAX} characters or fewer.`;
    case "single-name":
      return "Enter both names, for example Jane Wanjiku. One name on its own can be confused with another member's.";
  }
}

/** True when a stored name predates this rule, so the app can offer to fix it
 *  rather than silently keeping an unidentifiable row. */
export function isSingleName(raw: string): boolean {
  return contributorNameProblem(raw) === "single-name";
}

/** The ledger name for somebody who has an account: both names when we know
 *  them. Used when a member is folded into the sheet automatically, where
 *  taking only the first name is how most unidentifiable rows were created. */
export function memberLedgerName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const full = normalizeContributorName(`${firstName ?? ""} ${lastName ?? ""}`);
  return full.length > 0 ? full : null;
}
