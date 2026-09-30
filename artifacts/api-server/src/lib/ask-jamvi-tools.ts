/**
 * The tools Ask Jamvi answers with.
 *
 * It used to be handed one month's totals and the last 100 entries pasted into
 * a prompt, and asked to do the arithmetic itself - so anything older was
 * missed and some sums came out wrong. Now it asks for exactly what a
 * question needs, and every tool calls the same endpoint the app's own
 * screen uses, as the person asking. So its figures cannot differ from what
 * All income, All expenses, the Budget report, Business, Bank and Who owes
 * who show, and it sees only the budget that person has open.
 *
 * Results are trimmed to what an answer needs - totals, per-category and
 * per-stream figures, the largest entries - so a year of records does not
 * flood the model.
 */

/** Calls one of the app's own GET endpoints as the person asking, and returns its JSON. */
export type ApiCaller = (path: string) => Promise<unknown>;

export type ScreenLink = { label: string; route: string };

type ToolResult = { result: unknown; link?: ScreenLink };

const DAY = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "A day, YYYY-MM-DD" } as const;
const RANGE = { from: DAY, to: DAY };
const MONTH = {
  month: { type: "number", minimum: 1, maximum: 12 },
  year: { type: "number", minimum: 2000, maximum: 2200 },
};

/** The tool definitions, in the chat-completions "tools" format. */
export const ASK_JAMVI_TOOLS = [
  {
    type: "function",
    function: {
      name: "income",
      description: "Money that came in between two days: the total earned (a business counts its profit), each income stream's received, costs and net, money in that was not income (borrowed, repaid, from savings), and the largest entries. Optional search narrows to descriptions containing it.",
      parameters: { type: "object", properties: { ...RANGE, search: { type: "string" } }, required: ["from", "to"] },
    },
  },
  {
    type: "function",
    function: {
      name: "expenses",
      description: "Spending between two days: the total, the total per category, and the largest entries. Optional search narrows to descriptions containing it (a shop, a person, a bill).",
      parameters: { type: "object", properties: { ...RANGE, search: { type: "string" } }, required: ["from", "to"] },
    },
  },
  {
    type: "function",
    function: {
      name: "budget",
      description: "The household budget for one month against what was spent, per category: budget, spent, left or over. A business's costs are not in it; use business for those.",
      parameters: { type: "object", properties: MONTH, required: ["month", "year"] },
    },
  },
  {
    type: "function",
    function: {
      name: "business",
      description: "Profit and loss for each business in one month: sales, cost of goods sold, gross profit, expenses, net profit, with each cost by category.",
      parameters: { type: "object", properties: MONTH, required: ["month", "year"] },
    },
  },
  {
    type: "function",
    function: {
      name: "balances",
      description: "Every bank or M-Pesa account in this budget and its balance now.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "who_owes_whom",
      description: "People and businesses this budget owes money to, and who owes it money, with the amounts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Find any expense, bank entry, contribution or person by words in it, across all time.",
      parameters: { type: "object", properties: { text: { type: "string", minLength: 2 } }, required: ["text"] },
    },
  },
  {
    type: "function",
    function: {
      name: "compare",
      description: "Compare two periods: income, spending and spending per category in each, and the differences. Use for 'more than last month', trends and biggest changes.",
      parameters: {
        type: "object",
        properties: {
          firstFrom: DAY, firstTo: DAY, secondFrom: DAY, secondTo: DAY,
        },
        required: ["firstFrom", "firstTo", "secondFrom", "secondTo"],
      },
    },
  },
] as const;

const round = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const query = (params: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString();

type ExpenseEntry = { date: string; description: string; amount: number; categories?: string[] };
type ExpenseLedger = { from: string; to: string; total: number; entries?: ExpenseEntry[] };
type IncomeLedger = {
  from: string; to: string; total: number; received?: number; costs?: number;
  streams?: Array<{ name: string; received: number; costs: number; net: number }>;
  otherMoneyIn?: Record<string, number>;
  entries?: Array<{ date: string; description: string; amount: number; streams?: string[] }>;
};

function spendingByCategory(entries: ExpenseEntry[]): Array<{ category: string; total: number }> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const categories = entry.categories && entry.categories.length > 0 ? entry.categories : ["Uncategorized"];
    // A split expense is shared evenly across its categories here only for the
    // ranking; the ledger itself stays whole.
    for (const category of categories) totals.set(category, (totals.get(category) ?? 0) + num(entry.amount) / categories.length);
  }
  return [...totals.entries()].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total);
}

const largest = <T extends { amount: number }>(entries: T[], count: number) =>
  [...entries].sort((a, b) => num(b.amount) - num(a.amount)).slice(0, count);

async function expensesBetween(call: ApiCaller, from: string, to: string, search?: string) {
  const ledger = await call(`/api/dashboard/expense-ledger?${query({ from, to, q: search })}`) as ExpenseLedger;
  const entries = ledger.entries ?? [];
  return {
    from: ledger.from, to: ledger.to, total: round(num(ledger.total)), count: entries.length,
    byCategory: spendingByCategory(entries).slice(0, 20),
    largest: largest(entries, 15).map((entry) => ({ date: entry.date, description: entry.description, amount: round(num(entry.amount)), categories: entry.categories })),
  };
}

async function incomeBetween(call: ApiCaller, from: string, to: string, search?: string) {
  const ledger = await call(`/api/dashboard/income-ledger?${query({ from, to, q: search })}`) as IncomeLedger;
  const entries = ledger.entries ?? [];
  return {
    from: ledger.from, to: ledger.to,
    earned: round(num(ledger.total)), received: round(num(ledger.received ?? ledger.total)), streamCosts: round(num(ledger.costs)),
    streams: ledger.streams ?? [], notIncome: ledger.otherMoneyIn ?? {}, count: entries.length,
    largest: largest(entries, 15).map((entry) => ({ date: entry.date, description: entry.description, amount: round(num(entry.amount)), streams: entry.streams })),
  };
}

/** Runs one tool. An unknown tool or bad arguments come back as an error for the model to see, never a thrown request. */
export async function runAskJamviTool(name: string, args: Record<string, unknown>, call: ApiCaller): Promise<ToolResult> {
  switch (name) {
    case "income": {
      if (!isDay(args.from) || !isDay(args.to)) return { result: { error: "from and to must be days, YYYY-MM-DD" } };
      return { result: await incomeBetween(call, args.from, args.to, typeof args.search === "string" ? args.search : undefined), link: { label: "Open All income", route: "/income-ledger" } };
    }
    case "expenses": {
      if (!isDay(args.from) || !isDay(args.to)) return { result: { error: "from and to must be days, YYYY-MM-DD" } };
      return { result: await expensesBetween(call, args.from, args.to, typeof args.search === "string" ? args.search : undefined), link: { label: "Open All expenses", route: "/expense-ledger" } };
    }
    case "budget": {
      // The household's budget: a side hustle's costs are the business tool's.
      const rows = await call(`/api/dashboard/category-breakdown?${query({ month: num(args.month), year: num(args.year), scope: "household" })}`) as Array<{
        category: string; budgetAmount: number; spentAmount: number; isBudgeted?: boolean; parentName?: string | null;
      }>;
      // Top level only: a heading already includes its sub-categories.
      const top = rows.filter((row) => !row.parentName);
      return {
        result: {
          month: num(args.month), year: num(args.year),
          categories: top.map((row) => ({
            category: row.category,
            budget: round(num(row.budgetAmount)),
            spent: round(num(row.spentAmount)),
            over: row.budgetAmount > 0 ? round(Math.max(0, num(row.spentAmount) - num(row.budgetAmount))) : 0,
            hasBudget: row.isBudgeted !== false,
          })),
          totalBudget: round(top.filter((row) => row.isBudgeted !== false).reduce((sum, row) => sum + num(row.budgetAmount), 0)),
          totalSpent: round(top.reduce((sum, row) => sum + num(row.spentAmount), 0)),
        },
        link: { label: "Open Budget report", route: "/budget-report" },
      };
    }
    case "business":
      return {
        result: await call(`/api/dashboard/business?${query({ month: num(args.month), year: num(args.year) })}`),
        link: { label: "Open Business", route: "/business" },
      };
    case "balances": {
      // The accounts list carries no balance; the summary works each one out
      // without sending every transaction.
      const summary = await call("/api/ai/budget-summary") as { bankAccounts?: Array<{ name: string; balance?: number }> };
      const accounts = summary.bankAccounts ?? [];
      return {
        result: accounts.map((account) => ({ name: account.name, balance: round(num(account.balance)) })),
        link: { label: "Open Bank", route: "/(tabs)/bank" },
      };
    }
    case "who_owes_whom": {
      const parties = await call("/api/contributors") as Array<{ name: string; kind?: string; owedToUs?: number | null; owedByUs?: number | null }>;
      return {
        result: {
          weOwe: parties.filter((p) => num(p.owedByUs) > 0).map((p) => ({ name: p.name, amount: round(num(p.owedByUs)) })),
          owedToUs: parties.filter((p) => num(p.owedToUs) > 0).map((p) => ({ name: p.name, amount: round(num(p.owedToUs)) })),
        },
        link: { label: "Open Who owes who", route: "/parties" },
      };
    }
    case "search": {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      if (text.length < 2) return { result: { error: "search text needs at least 2 characters" } };
      const found = await call(`/api/search?${query({ q: text.slice(0, 120) })}`) as { results?: unknown[] } | unknown[];
      const results = Array.isArray(found) ? found : found.results ?? [];
      return { result: { text, count: results.length, results: results.slice(0, 20) }, link: { label: "Open Search", route: "/(tabs)/search" } };
    }
    case "compare": {
      const days = [args.firstFrom, args.firstTo, args.secondFrom, args.secondTo];
      if (!days.every(isDay)) return { result: { error: "all four must be days, YYYY-MM-DD" } };
      const [firstSpend, secondSpend, firstIncome, secondIncome] = await Promise.all([
        expensesBetween(call, args.firstFrom as string, args.firstTo as string),
        expensesBetween(call, args.secondFrom as string, args.secondTo as string),
        incomeBetween(call, args.firstFrom as string, args.firstTo as string),
        incomeBetween(call, args.secondFrom as string, args.secondTo as string),
      ]);
      const categories = new Set([...firstSpend.byCategory, ...secondSpend.byCategory].map((row) => row.category));
      const amountIn = (rows: Array<{ category: string; total: number }>, category: string) => rows.find((row) => row.category === category)?.total ?? 0;
      const changes = [...categories].map((category) => {
        const first = amountIn(firstSpend.byCategory, category);
        const second = amountIn(secondSpend.byCategory, category);
        return { category, first, second, change: round(second - first) };
      }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 15);
      return {
        result: {
          first: { from: args.firstFrom, to: args.firstTo, spent: firstSpend.total, earned: firstIncome.earned },
          second: { from: args.secondFrom, to: args.secondTo, spent: secondSpend.total, earned: secondIncome.earned },
          spentChange: round(secondSpend.total - firstSpend.total),
          earnedChange: round(secondIncome.earned - firstIncome.earned),
          biggestCategoryChanges: changes,
        },
        link: { label: "Open Reports", route: "/(tabs)/reports" },
      };
    }
    default:
      return { result: { error: `There is no tool called ${name}.` } };
  }
}
