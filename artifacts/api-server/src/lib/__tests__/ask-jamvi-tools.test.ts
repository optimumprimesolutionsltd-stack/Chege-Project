import { describe, expect, it, vi } from "vitest";
import { ASK_JAMVI_TOOLS, runAskJamviTool } from "../ask-jamvi-tools";
import { askJamviWithTools } from "../ask-jamvi-llm";

// The screens' own endpoints, faked: what each tool is handed back.
const expenseLedger = {
  from: "2026-09-01", to: "2026-09-30", total: 61000,
  entries: [
    { date: "2026-09-02", description: "Naivas", amount: 12000, categories: ["Groceries"] },
    { date: "2026-09-05", description: "Rent", amount: 25000, categories: ["Rent"] },
    { date: "2026-09-10", description: "Shop", amount: 4000, categories: ["Groceries", "Household"] },
    { date: "2026-09-12", description: "Fuel", amount: 20000, categories: ["Generator fuel"] },
  ],
};
const incomeLedger = {
  from: "2026-09-01", to: "2026-09-30", total: 90000, received: 110000, costs: 20000,
  streams: [{ name: "Generator income", received: 60000, costs: 20000, net: 40000 }],
  otherMoneyIn: { borrowed: 5000, repaidToYou: 0, fromSavings: 0 },
  entries: [{ date: "2026-09-03", description: "Salary", amount: 50000, streams: ["Salary"] }],
};

function fakeApi(): { call: (path: string) => Promise<unknown>; asked: string[] } {
  const asked: string[] = [];
  const call = async (path: string) => {
    asked.push(path);
    if (path.startsWith("/api/dashboard/expense-ledger")) return expenseLedger;
    if (path.startsWith("/api/dashboard/income-ledger")) return incomeLedger;
    if (path.startsWith("/api/dashboard/category-breakdown")) return [
      { category: "Food", budgetAmount: 20000, spentAmount: 23000, parentName: null },
      { category: "Groceries", budgetAmount: 15000, spentAmount: 18500, parentName: "Food" },
      { category: "Gifts", budgetAmount: 0, spentAmount: 3000, isBudgeted: false, parentName: null },
    ];
    if (path.startsWith("/api/ai/budget-summary")) return { bankAccounts: [{ name: "M-Pesa", balance: 3003.92 }] };
    if (path.startsWith("/api/contributors")) return [
      { name: "Hermda trders", owedByUs: 75000, owedToUs: 0 },
      { name: "Ujenzi Distributors Ltd", owedByUs: 0, owedToUs: 0 },
    ];
    if (path.startsWith("/api/search")) return { results: Array.from({ length: 30 }, (_, i) => ({ id: i })) };
    if (path.startsWith("/api/dashboard/business")) return { businesses: [], totals: {} };
    throw new Error(`unexpected ${path}`);
  };
  return { call, asked };
}

describe("the tools", () => {
  it("are offered to the model by name", () => {
    expect(ASK_JAMVI_TOOLS.map((tool) => tool.function.name)).toEqual(
      ["income", "expenses", "budget", "business", "balances", "who_owes_whom", "search", "compare"],
    );
  });

  it("ask the screen's own endpoint, for the dates given", async () => {
    const api = fakeApi();
    const { result, link } = await runAskJamviTool("expenses", { from: "2026-09-01", to: "2026-09-30", search: "naivas" }, api.call);
    expect(api.asked).toEqual(["/api/dashboard/expense-ledger?from=2026-09-01&to=2026-09-30&q=naivas"]);
    expect(link).toEqual({ label: "Open All expenses", route: "/expense-ledger" });
    expect(result).toMatchObject({ total: 61000, count: 4 });
  });

  it("add spending up per category, sharing a split one", async () => {
    const { result } = await runAskJamviTool("expenses", { from: "2026-09-01", to: "2026-09-30" }, fakeApi().call);
    expect((result as { byCategory: unknown[] }).byCategory).toEqual([
      { category: "Rent", total: 25000 },
      { category: "Generator fuel", total: 20000 },
      { category: "Groceries", total: 14000 },
      { category: "Household", total: 2000 },
    ]);
  });

  it("give income as earned, with streams and money in that was not income", async () => {
    const { result } = await runAskJamviTool("income", { from: "2026-09-01", to: "2026-09-30" }, fakeApi().call);
    expect(result).toMatchObject({ earned: 90000, received: 110000, streamCosts: 20000, notIncome: { borrowed: 5000 } });
  });

  it("read the budget at the top level only, so a heading is not counted twice", async () => {
    const { result } = await runAskJamviTool("budget", { month: 9, year: 2026 }, fakeApi().call);
    expect(result).toMatchObject({ totalBudget: 20000, totalSpent: 26000 });
    expect((result as { categories: Array<{ category: string; over: number }> }).categories[0]).toMatchObject({ category: "Food", over: 3000 });
  });

  it("say who is owed and who owes, leaving out anyone square", async () => {
    const { result } = await runAskJamviTool("who_owes_whom", {}, fakeApi().call);
    expect(result).toEqual({ weOwe: [{ name: "Hermda trders", amount: 75000 }], owedToUs: [] });
  });

  it("give balances without loading every transaction", async () => {
    const api = fakeApi();
    const { result } = await runAskJamviTool("balances", {}, api.call);
    expect(api.asked).toEqual(["/api/ai/budget-summary"]);
    expect(result).toEqual([{ name: "M-Pesa", balance: 3003.92 }]);
  });

  it("keep a search to twenty results", async () => {
    const { result } = await runAskJamviTool("search", { text: "fuel" }, fakeApi().call);
    expect(result).toMatchObject({ count: 30 });
    expect((result as { results: unknown[] }).results).toHaveLength(20);
  });

  it("compare two periods with the differences worked out", async () => {
    const { result } = await runAskJamviTool("compare", {
      firstFrom: "2026-08-01", firstTo: "2026-08-31", secondFrom: "2026-09-01", secondTo: "2026-09-30",
    }, fakeApi().call);
    expect(result).toMatchObject({ spentChange: 0, earnedChange: 0 });
  });

  it("answer bad arguments or an unknown tool with an error the model can read", async () => {
    expect((await runAskJamviTool("expenses", { from: "last month" }, fakeApi().call)).result).toMatchObject({ error: expect.any(String) });
    expect((await runAskJamviTool("transfer_money", {}, fakeApi().call)).result).toMatchObject({ error: expect.stringContaining("no tool") });
  });
});

const provider = { endpoint: "https://model.test/v1/chat/completions", apiKey: "k", model: "m" };
const reply = (message: unknown) => ({ ok: true, json: async () => ({ choices: [{ message }] }) }) as Response;

describe("answering with tools", () => {
  it("runs the tools the model asks for, then answers with links to those screens", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [
        { id: "a", type: "function", function: { name: "expenses", arguments: '{"from":"2026-09-01","to":"2026-09-30"}' } },
      ] }))
      .mockResolvedValueOnce(reply({ content: "You spent KES 61,000 in September, most of it on rent." }));
    const runTool = vi.fn(async () => ({ result: { total: 61000 }, link: { label: "Open All expenses", route: "/expense-ledger" } }));

    const answer = await askJamviWithTools({
      question: "How much did I spend this month?", today: "2026-09-29", workspaceName: "Mine", isPrivate: true,
      tools: ASK_JAMVI_TOOLS, runTool, provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(runTool).toHaveBeenCalledWith("expenses", { from: "2026-09-01", to: "2026-09-30" });
    expect(answer).toEqual({ answer: "You spent KES 61,000 in September, most of it on rent.", links: [{ label: "Open All expenses", route: "/expense-ledger" }] });
    const second = JSON.parse((fetchImpl.mock.calls[1][1] as { body: string }).body);
    expect(second.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "a", content: '{"total":61000}' });
  });

  it("tells the model today's date and which budget it is in", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply({ content: "Hi" }));
    await askJamviWithTools({
      question: "Hi", today: "2026-09-29", workspaceName: "lydiah and chege", isPrivate: false,
      tools: ASK_JAMVI_TOOLS, runTool: vi.fn(), provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const system = JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body).messages[0].content as string;
    expect(system).toContain("Today is 2026-09-29");
    expect(system).toContain('"lydiah and chege", a Shared group');
    expect(system).toContain("never guess or invent a number");
  });

  it("carries on the conversation, keeping the last eight turns", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply({ content: "In August it was KES 58,000." }));
    const history = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `turn ${i}` }));
    await askJamviWithTools({
      question: "And August?", history, today: "2026-09-29", workspaceName: "Mine", isPrivate: true,
      tools: ASK_JAMVI_TOOLS, runTool: vi.fn(), provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const messages = JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body).messages as Array<{ content: string }>;
    expect(messages).toHaveLength(1 + 8 + 1);
    expect(messages[1].content).toBe("turn 4");
    expect(messages.at(-1)!.content).toBe("And August?");
  });

  it("tells the model when a tool fails, rather than giving up", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [{ id: "a", type: "function", function: { name: "balances", arguments: "{}" } }] }))
      .mockResolvedValueOnce(reply({ content: "I could not load your balances just now." }));
    const answer = await askJamviWithTools({
      question: "Balance?", today: "2026-09-29", workspaceName: "Mine", isPrivate: true,
      tools: ASK_JAMVI_TOOLS, runTool: vi.fn(async () => { throw new Error("down"); }), provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(answer?.answer).toContain("could not load");
  });

  it("stops offering tools after six rounds, so it has to answer", async () => {
    const toolRound = reply({ content: null, tool_calls: [{ id: "a", type: "function", function: { name: "balances", arguments: "{}" } }] });
    const fetchImpl = vi.fn();
    for (let i = 0; i < 6; i += 1) fetchImpl.mockResolvedValueOnce(toolRound);
    fetchImpl.mockResolvedValueOnce(reply({ content: "Done." }));
    const answer = await askJamviWithTools({
      question: "?", today: "2026-09-29", workspaceName: "Mine", isPrivate: true,
      tools: ASK_JAMVI_TOOLS, runTool: vi.fn(async () => ({ result: {} })), provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(answer?.answer).toBe("Done.");
    const last = JSON.parse((fetchImpl.mock.calls[6][1] as { body: string }).body);
    expect(last.tools).toBeUndefined();
  });

  it("returns nothing when there is no model, or it fails, so the old answer is used", async () => {
    const base = { question: "?", today: "2026-09-29", workspaceName: "Mine", isPrivate: true, tools: ASK_JAMVI_TOOLS, runTool: vi.fn() };
    expect(await askJamviWithTools({ ...base, provider: null })).toBeNull();
    const failing = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    expect(await askJamviWithTools({ ...base, provider, fetchImpl: failing as unknown as typeof fetch })).toBeNull();
  });
});
