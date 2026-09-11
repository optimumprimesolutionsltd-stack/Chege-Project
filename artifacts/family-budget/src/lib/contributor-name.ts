/**
 * What a person in the ledger has to be called, checked before the request
 * leaves the browser so a treasurer typing forty names at a meeting is told at
 * the input rather than by a failed save.
 *
 * The server enforces the same rule in `api-server/src/lib/contributor-name.ts`
 * and is the authority; this is a mirror, kept honest by contributor-name.test.ts.
 */

export const CONTRIBUTOR_NAME_MAX = 120;

export function normalizeContributorName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function nameParts(name: string): string[] {
  return name.split(" ").filter((part) => /\p{L}/u.test(part));
}

export type ContributorNameProblem = "empty" | "too-long" | "single-name";

export function contributorNameProblem(raw: string): ContributorNameProblem | null {
  const name = normalizeContributorName(raw);
  if (name.length === 0) return "empty";
  if (name.length > CONTRIBUTOR_NAME_MAX) return "too-long";
  if (nameParts(name).length < 2) return "single-name";
  return null;
}

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

/** A row stored before the rule existed. Flagged in the sheet so it can be
 *  completed, never hidden. */
export function isSingleName(raw: string): boolean {
  return contributorNameProblem(raw) === "single-name";
}
