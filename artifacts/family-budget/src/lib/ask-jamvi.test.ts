import { describe, expect, it } from "vitest";
import { answerAskJamviQuery, classifyAskJamviQuery } from "./ask-jamvi";

const summary = {
  period: { month: 8, year: 2026, currency: "KES" },
  workspace: { name: "My Personal budget", isPrivate: true },
  totals: { budgeted: 30000, spent: 12500, remaining: 17500, incomeReceived: 40000 },
  categories: [
    { name: "Food", budgeted: 10000, spent: 7000, remaining: 3000 },
    { name: "Transport", budgeted: 5000, spent: 5500, remaining: -500 },
  ],
  goals: [{ name: "Emergency Fund", targetAmount: 50000, currentAmount: 12000, remaining: 38000, deadline: null }],
};

describe("Ask Jamvi query handling", () => {
  it.each([
    ["How am I doing this month?", "overview"],
    ["Where am I spending the most?", "spending"],
    ["How much is left?", "remaining"],
    ["What are my savings goals?", "goals"],
    ["How much income did I receive?", "income"],
    ["Tell me a joke", "unknown"],
  ])("classifies %s as %s", (query, intent) => {
    expect(classifyAskJamviQuery(query)).toBe(intent);
  });

  it("answers using only the selected workspace summary", () => {
    const answer = answerAskJamviQuery("How much is left?", summary);
    expect(answer.intent).toBe("remaining");
    expect(answer.text).toContain("My Personal budget");
    expect(answer.text).toContain("KES 17,500");
  });

  it("keeps savings goals separate from expense totals", () => {
    const answer = answerAskJamviQuery("What are my savings goals?", summary);
    expect(answer.text).toContain("Emergency Fund");
    expect(answer.text).not.toContain("12,500");
  });

  it("gives a safe prompt for unsupported questions", () => {
    const answer = answerAskJamviQuery("Move money to my bank", summary);
    expect(answer.intent).toBe("unknown");
    expect(answer.text).toMatch(/overview|spending|remaining|income|savings/i);
  });
});
