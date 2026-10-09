import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ilike, sql } from "drizzle-orm";
import { everyWord, searchWords, wordPattern } from "../search-words";

// "William nyoro" found nothing when M-Pesa wrote "WILLIAM K NYORO 0712...";
// people should be found by "anything in the brief description" (9 Oct 2026).
describe("search by words", () => {
  it("splits what was typed into words, once each", () => {
    expect(searchWords("  William   nyoro ")).toEqual(["william", "nyoro"]);
    expect(searchWords("Nyoro nyoro")).toEqual(["nyoro"]);
    expect(searchWords("a b c d e f g h")).toHaveLength(6);
    expect(searchWords("   ")).toEqual([]);
  });

  it("takes % and _ literally", () => {
    expect(wordPattern("50%")).toBe("%50\%%");
    expect(wordPattern("a_b")).toBe("%a\_b%");
  });

  it("needs every word, each in any of the fields", () => {
    const description = sql`${sql.identifier("description")}`;
    const notes = sql`${sql.identifier("notes")}`;
    const query = new PgDialect().sqlToQuery(
      everyWord(["william", "nyoro"], (pattern) => [ilike(description, pattern), ilike(notes, pattern)]),
    );
    expect(query.sql).toBe('(("description" ilike $1 or "notes" ilike $2) and ("description" ilike $3 or "notes" ilike $4))');
    expect(query.params).toEqual(["%william%", "%william%", "%nyoro%", "%nyoro%"]);
  });

  it("finds nothing for no words", () => {
    expect(new PgDialect().sqlToQuery(everyWord([], () => [])).sql).toBe("false");
  });

  it("is how Search looks through entries, people, goals and income streams", () => {
    const ai = readFileSync("src/routes/ai.ts", "utf8");
    expect(ai).toContain("const words = searchWords(query);");
    expect(ai).toContain("everyWord(words, (pattern) => [\n                ilike(jointAccountTxTable.description, pattern),");
    expect(ai).toContain("everyWord(words, (pattern) => [\n                ilike(expensesTable.description, pattern),");
    expect(ai).toContain("everyWord(words, (pattern) => [\n          ilike(groupContributorsTable.name, pattern),");
    expect(ai).not.toContain("const pattern = `%${query");
  });
});
