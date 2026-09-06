/**
 * The generated view-link passphrase.
 *
 * This is a credential, so the tests are about the properties that make it one
 * rather than about the exact words: enough of them, drawn unpredictably, and
 * safe to say out loud in a room.
 */

import { describe, expect, it } from "vitest";
import { generatePassphrase, PASSPHRASE_WORDS } from "../passphrase";

describe("generatePassphrase", () => {
  it("is three words and four digits", () => {
    const parts = generatePassphrase().split("-");

    expect(parts).toHaveLength(4);
    for (const word of parts.slice(0, 3)) {
      expect(PASSPHRASE_WORDS).toContain(word);
    }
    expect(parts[3]).toMatch(/^\d{4}$/);
  });

  it("does not repeat itself", () => {
    // Not a randomness test, which cannot be written honestly. It catches the
    // failure that matters: a generator seeded once, or returning a constant.
    const seen = new Set(Array.from({ length: 200 }, () => generatePassphrase()));

    expect(seen.size).toBeGreaterThan(190);
  });

  it("uses the whole word list, not a corner of it", () => {
    const used = new Set<string>();
    for (let i = 0; i < 3_000; i += 1) {
      for (const word of generatePassphrase().split("-").slice(0, 3)) used.add(word);
    }

    // With this many draws every word should appear; a biased index would
    // leave the ends of the list untouched.
    expect(used.size).toBe(PASSPHRASE_WORDS.length);
  });

  it("never produces a digit group outside four digits", () => {
    // randomInt(1000, 10000) is exclusive at the top; an off-by-one here would
    // produce a five-digit tail or a three-digit one on occasion.
    for (let i = 0; i < 2_000; i += 1) {
      expect(generatePassphrase().split("-")[3]).toMatch(/^\d{4}$/);
    }
  });
});

describe("the word list", () => {
  it("has no duplicates, which would quietly reduce the entropy", () => {
    expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
  });

  it("is large enough to be worth having", () => {
    // Three words from a list this size, plus four digits, is far beyond what
    // the attempt limiter allows anybody to work through.
    expect(PASSPHRASE_WORDS.length).toBeGreaterThanOrEqual(64);
  });

  it("holds only plain lowercase words, so it survives being said and typed", () => {
    for (const word of PASSPHRASE_WORDS) {
      expect(word).toMatch(/^[a-z]{2,12}$/);
    }
  });

  it("contains no hyphens, which are the separator", () => {
    for (const word of PASSPHRASE_WORDS) {
      expect(word).not.toContain("-");
    }
  });
});
