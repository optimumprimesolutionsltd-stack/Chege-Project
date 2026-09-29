import { describe, expect, it } from "vitest";
import { generateAskJamviFallback } from "../ask-jamvi-llm";

const summary = {
  period: { month: 9, year: 2026, currency: "KES" },
  workspace: { name: "Mine", kind: "personal", isPrivate: true },
  totals: { budgeted: 375000, spent: 290000, remaining: 85000, incomeReceived: 310000 },
  categories: [],
  goals: [],
  allLedgerEntries: [
    { kind: "bank", id: 1, date: "2026-09-26", description: "Sofia Akwiji", category: null, amount: 12000, direction: "in" },
    { kind: "bank", id: 2, date: "2026-09-10", description: "Naivas", category: "Groceries", amount: 3000, direction: "out" },
  ],
} as never;

// "How much did I use this month" answered with two stray ledger entries.
describe("Ask Jamvi without a model", () => {
  it("answers how much was used or spent with the month's total", () => {
    for (const question of ["How much did I use this month?", "how much have I spent", "What is my total spending?"]) {
      expect(generateAskJamviFallback(question, summary)).toContain("you have spent KES 290,000 of your KES 375,000 budget");
    }
  });

  it("still searches when a payee is named", () => {
    expect(generateAskJamviFallback("How much did I spend at Naivas this month?", summary)).toContain("Naivas");
  });
});

// "Zawadi in Optimum has Gemini, why can't we link Gemini here?"
describe("the model's address", () => {
  it("takes Gemini's OpenAI-compatible base as it is meant to be used", async () => {
    const { chatCompletionsUrl } = await import("../ask-jamvi-llm");
    expect(chatCompletionsUrl("https://generativelanguage.googleapis.com/v1beta/openai/")).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(chatCompletionsUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/chat/completions");
    expect(chatCompletionsUrl("https://api.example.com")).toBe("https://api.example.com/v1/chat/completions");
    expect(chatCompletionsUrl("https://x.test/v1/chat/completions")).toBe("https://x.test/v1/chat/completions");
  });
});
