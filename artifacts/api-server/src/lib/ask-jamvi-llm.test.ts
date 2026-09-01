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

  it("does not leak provider error details to callers", async () => {
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
      .rejects.toThrow("Ask Jamvi could not answer right now.");
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
