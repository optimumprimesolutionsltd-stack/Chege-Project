import { describe, expect, it } from "vitest";
import { contributorNameProblem, isSingleName, normalizeContributorName } from "./contributor-name";
import * as server from "../../../api-server/src/lib/contributor-name";

/**
 * The client copy exists so a name is rejected at the input rather than by a
 * failed save. That is only safe while it agrees with the server, so the two
 * implementations are run against the same names here. A rule tightened on one
 * side and forgotten on the other would otherwise let a name through the form
 * and fail at the API — or, worse, quietly accept one the server would keep.
 */
const NAMES = [
  "Jane Wanjiku",
  "John Kamau Mwangi",
  "Abdi Hassan Noor Farah",
  "Anne-Marie Otieno",
  "Mary O'Brien",
  "J. Wanjiku",
  "  Jane   Wanjiku ",
  "John",
  "  Mary  ",
  "Anne-Marie",
  "John .",
  ".",
  "",
  "   ",
  `${"a".repeat(60)} ${"b".repeat(61)}`,
  `Jane${" ".repeat(40)}Wanjiku`,
];

describe("the client mirror matches the server rule", () => {
  it.each(NAMES)("agrees on %j", (name) => {
    expect(contributorNameProblem(name)).toBe(server.contributorNameProblem(name));
    expect(normalizeContributorName(name)).toBe(server.normalizeContributorName(name));
    expect(isSingleName(name)).toBe(server.isSingleName(name));
  });

  it("shares the same length limit", () => {
    expect(server.CONTRIBUTOR_NAME_MAX).toBe(120);
  });
});

describe("contributorNameProblem", () => {
  it("accepts two or more names", () => {
    expect(contributorNameProblem("Jane Wanjiku")).toBeNull();
    expect(contributorNameProblem("John Kamau Mwangi")).toBeNull();
    expect(contributorNameProblem("Anne-Marie Otieno")).toBeNull();
  });

  it("rejects a single name, which cannot be told from the next John", () => {
    expect(contributorNameProblem("John")).toBe("single-name");
    expect(contributorNameProblem("Anne-Marie")).toBe("single-name");
    expect(contributorNameProblem("John .")).toBe("single-name");
  });

  it("rejects empty and over-long names", () => {
    expect(contributorNameProblem("   ")).toBe("empty");
    expect(contributorNameProblem(`${"a".repeat(60)} ${"b".repeat(61)}`)).toBe("too-long");
  });

  it("normalises before judging", () => {
    expect(normalizeContributorName("  Jane   Wanjiku ")).toBe("Jane Wanjiku");
    expect(contributorNameProblem(`Jane${" ".repeat(40)}Wanjiku`)).toBeNull();
  });

  it("flags legacy single-name rows only", () => {
    expect(isSingleName("John")).toBe(true);
    expect(isSingleName("John Kamau")).toBe(false);
  });
});
