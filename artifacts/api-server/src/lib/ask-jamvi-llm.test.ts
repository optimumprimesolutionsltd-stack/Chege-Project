import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAskJamviResponse, isAskJamviActionRequest } from "./ask-jamvi-llm";

const summary = {
  period: { month: 8, year: 2026, currency: "KES" },
  workspace: { name: "Personal budget", isPrivate: true },
  totals: { budgeted: 30000, spent: 12000, remaining: 18000, incomeReceived: 40000 },
  categories: [],
  goals: [],
};

afterEach(() => vi.restoreAllMocks());

describe("Ask Jamvi server LLM guardrails", () => {
  it.each(["Move money to savings", "Move KES 500 to savings", "delete my expense", "change my budget"]) ("identifies action request: %s", (question) => {
    expect(isAskJamviActionRequest(question)).toBe(true);
  });

  it("answers action requests without calling the model", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const answer = await generateAskJamviResponse("Transfer KES 500", summary);
    expect(answer).toMatch(/cannot move money|change records/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the question and selected summary to the server-side model", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "You have KES 18,000 left." } }] }), { status: 200 }));
    const answer = await generateAskJamviResponse("How much is left?", summary);
    expect(answer).toBe("You have KES 18,000 left.");
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(fetchSpy.mock.calls[0][0]).toBe("https://forge.example/v1/chat/completions");
    expect(body.messages[1].content).toContain("How much is left?");
    expect(body.messages[1].content).toContain("Personal budget");
    expect(body.messages[0].content).toContain("Never instruct or claim");
    expect(body.max_completion_tokens).toBe(8192);
  });

  it("uses the managed Replit OpenAI integration when no override is set", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://managed-openai.example";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "You have KES 18,000 left." } }] }), { status: 200 }));

    await expect(generateAskJamviResponse("How much is left?", summary)).resolves.toBe("You have KES 18,000 left.");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://managed-openai.example/chat/completions");
  });

  it("answers from the read-only summary when no AI provider is configured", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateAskJamviResponse("How much is left?", summary))
      .resolves.toContain("KES 18,000");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("finds a matching expense ledger entry without an AI provider", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    await expect(generateAskJamviResponse("Find Kids offering in my ledger", {
      ...summary,
      ledgerEntries: [{
        kind: "expense",
        id: 17,
        date: "2026-08-17",
        description: "Kids offering",
        category: "Welfare",
        amount: 2000,
        direction: "out",
      }],
    })).resolves.toContain("Kids offering — KES 2,000");
  });

  it("falls back without leaking provider error details to callers", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://managed-openai.example";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: "unsupported_parameter", message: "Provider detail" },
    }), { status: 400 }));

    await expect(generateAskJamviResponse("How much is left?", summary))
      .resolves.toBe("Personal budget has KES 18,000 left for August 2026.");
  });

  it("falls back when the configured provider cannot be reached", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://managed-openai.example";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(generateAskJamviResponse("How am I doing this month?", summary))
      .resolves.toContain("spent KES 12,000 of KES 30,000");
  });

  it("reads managed chat responses that return content parts", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://managed-openai.example";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: [{ type: "text", text: "KES 18,000 remains." }] } }],
    }), { status: 200 }));

    await expect(generateAskJamviResponse("How much is left?", summary))
      .resolves.toBe("KES 18,000 remains.");
  });

  it("reads Responses-style output text when returned by the managed proxy", async () => {
    delete process.env.ASK_JAMVI_API_URL;
    delete process.env.ASK_JAMVI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://managed-openai.example";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "managed-test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: "KES 18,000 remains." }] }],
    }), { status: 200 }));

    await expect(generateAskJamviResponse("How much is left?", summary))
      .resolves.toBe("KES 18,000 remains.");
  });
});
