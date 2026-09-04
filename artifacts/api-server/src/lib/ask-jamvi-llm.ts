export type AskJamviSummary = {
  period: { month: number; year: number; currency: string };
  workspace: { name: string; isPrivate: boolean; kind?: string };
  totals: { budgeted: number; spent: number; remaining: number; incomeReceived: number };
  categories: Array<{ name: string; budgeted: number; spent: number; remaining: number; priority?: number }>;
  goals: Array<{ name: string; targetAmount: number; currentAmount: number; remaining: number; deadline: string | null }>;
  ledgerEntries?: Array<{
    kind: "expense" | "bank";
    id: number;
    date: string;
    description: string;
    category: string | null;
    amount: number;
    direction: "in" | "out";
  }>;
  allLedgerEntries?: Array<{
    kind: "expense" | "bank";
    id: number;
    date: string;
    description: string;
    category: string | null;
    amount: number;
    direction: "in" | "out";
  }>;
  allTimeTotals?: { spent: number; incomeReceived: number };
  allTimeCategories?: Array<{ name: string; spent: number }>;
  bankAccounts?: Array<{ id: number; name: string; openingBalance: number; openingBalanceDate: string | null; balance: number }>;
  incomeSources?: Array<{ id: number; name: string; expectedMonthlyAmount: number; isMain: boolean; userId: string }>;
  contributions?: Array<{ id: number; userId: string; amount: number; month: number; year: number; note: string | null }>;
  allContributions?: Array<{ id: number; userId: string; amount: number; month: number; year: number; note: string | null }>;
  members?: Array<{ userId: string; monthlyTarget: number | null }>;
};

const ACTION_REQUEST = /^(?:please\s+)?(?:transfer|send|withdraw|deposit|pay|create|add|delete|remove|edit|change|update|save|set)\b|\b(?:can|could|would|will)\s+you\s+(?:transfer|send|withdraw|deposit|pay|create|add|delete|remove|edit|change|update|save|set)\b|\bmove\s+(?:money|\w+\s+\d+(?:\.\d+)?|\d+(?:\.\d+)?)\b.{0,80}\b(to|into)\b|\bmove money\b/i;

export function isAskJamviActionRequest(question: string): boolean {
  return ACTION_REQUEST.test(question.trim());
}

type AskJamviIntent = "overview" | "spending" | "remaining" | "goals" | "income" | "ledger" | "bank" | "activity" | "workspace" | "report" | "unknown";

function classifyQuestion(question: string): AskJamviIntent {
  const value = question.trim().toLocaleLowerCase("en-US");
  if (/(report|trend|compare|comparison|month over month|year over year|average|history|historical|this year|last year|all time|over time)/.test(value)) return "report";
  if (/(ledger|transaction|payment|entry|record|find|search|when did|how much did)/.test(value)) return "ledger";
  if (/(bank|account|withdraw|cash|deposit)/.test(value)) return "bank";
  if (/(activity|history|contribut|member|who paid)/.test(value)) return "activity";
  if (/(workspace|budget name|personal budget|shared budget|group|category|categories|income source)/.test(value)) return "workspace";
  if (/(goal|saving|save|emergency|target)/.test(value)) return "goals";
  if (/(income|earn|deposit|received|contribution)/.test(value)) return "income";
  if (/(where|spend|spent|spending|category|categories|most)/.test(value)) return "spending";
  if (/(left|remain|remaining|afford|balance)/.test(value)) return "remaining";
  if (/(how am i|overview|summary|doing|budget|month)/.test(value)) return "overview";
  return "unknown";
}

const formatKes = (amount: number) => `KES ${Math.round(amount).toLocaleString("en-KE")}`;

export function generateAskJamviFallback(question: string, summary: AskJamviSummary): string {
  const intent = classifyQuestion(question);
  const { totals, categories, goals, workspace, period, ledgerEntries = [] } = summary;
  const allLedgerEntries = summary.allLedgerEntries ?? ledgerEntries;
  const periodLabel = new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric" })
    .format(new Date(period.year, period.month - 1, 1));
  const searchTerms = question.toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && ![
      "find", "search", "ledger", "entry", "entries", "payment", "payments", "transaction", "transactions", "record", "records",
      "about", "this", "that", "when", "much", "what", "where", "which", "show", "tell", "please", "did", "have", "has",
      "been", "was", "were", "from", "with", "into", "over", "last", "month", "year", "all", "time", "spent", "spending",
      "expense", "expenses", "bank", "account", "accounts", "money", "income", "received", "contribution", "contributions",
      "how", "for", "the", "and", "pay", "paid", "deposit", "deposited", "withdraw", "withdrew", "withdrawn",
    ].includes(term));
  const ledgerMatches = allLedgerEntries.filter((entry) => {
    const haystack = `${entry.description} ${entry.category ?? ""} ${entry.date} ${entry.amount}`.toLocaleLowerCase("en-US");
    return searchTerms.length > 0 && searchTerms.every((term) => haystack.includes(term));
  }).slice(0, 5);
  if (intent === "ledger" || (intent === "unknown" && ledgerMatches.length > 0)) {
    const asksAboutDeposits = /\b(deposit|deposited|deposits)\b/i.test(question);
    const asksAboutWithdrawals = /\b(withdraw|withdrew|withdrawn|withdrawals)\b/i.test(question);
    if (searchTerms.length === 0 && (asksAboutDeposits || asksAboutWithdrawals)) {
      const direction = asksAboutDeposits ? "in" : "out";
      const matchingBankEntries = allLedgerEntries.filter((entry) => entry.kind === "bank" && entry.direction === direction);
      const total = matchingBankEntries.reduce((sum, entry) => sum + entry.amount, 0);
      return matchingBankEntries.length > 0
        ? `Across the available bank history, ${matchingBankEntries.length} ${asksAboutDeposits ? "deposit" : "withdrawal"}${matchingBankEntries.length === 1 ? "" : "s"} total ${formatKes(total)}.`
        : `I could not find a ${asksAboutDeposits ? "deposit" : "withdrawal"} in the available bank history.`;
    }
    return ledgerMatches.length > 0
      ? `I found ${ledgerMatches.length} matching ledger ${ledgerMatches.length === 1 ? "entry" : "entries"} totaling ${formatKes(ledgerMatches.reduce((sum, entry) => sum + entry.amount, 0))}: ${ledgerMatches.map((entry) => `${entry.description} — ${formatKes(entry.amount)} on ${entry.date} (${entry.kind === "bank" ? "bank" : entry.category ?? "expense"})`).join("; ")}.`
      : `I could not find a matching expense or bank ledger entry in the available history. Try the Search tab for older records beyond Ask Jamvi's bounded context.`;
  }
  if (intent === "bank") {
    const accounts = summary.bankAccounts ?? [];
    return accounts.length > 0
      ? `${workspace.name} has ${accounts.length} bank account${accounts.length === 1 ? "" : "s"}: ${accounts.map((account) => `${account.name} (${formatKes(account.balance)})`).join(", ")}.`
      : `${workspace.name} does not have a bank account set up yet.`;
  }
  if (intent === "activity") {
    const contributions = summary.allContributions ?? summary.contributions ?? [];
    return contributions.length > 0
      ? `${contributions.length} contribution${contributions.length === 1 ? "" : "s"} totaling ${formatKes(contributions.reduce((sum, item) => sum + item.amount, 0))} were recorded for ${periodLabel}.`
      : `There is no contribution activity recorded for ${periodLabel}.`;
  }
  if (intent === "workspace") {
    const sourceCount = summary.incomeSources?.length ?? 0;
    return `${workspace.name} is your ${workspace.isPrivate ? "Personal budget" : "Shared budget"} with ${categories.length} budget categor${categories.length === 1 ? "y" : "ies"} and ${sourceCount} income source${sourceCount === 1 ? "" : "s"}.`;
  }
  if (intent === "remaining") {
    return totals.remaining >= 0
      ? `${workspace.name} has ${formatKes(totals.remaining)} left for ${periodLabel}.`
      : `${workspace.name} is over budget by ${formatKes(Math.abs(totals.remaining))} for ${periodLabel}.`;
  }
  if (intent === "spending") {
    const ranked = categories.filter((category) => category.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 3);
    return ranked.length
      ? `Your highest spending is ${ranked.map((category) => `${category.name} (${formatKes(category.spent)})`).join(", ")}.`
      : `There is no recorded spending in ${periodLabel} yet.`;
  }
  if (intent === "goals") {
    return goals.length
      ? `You have ${goals.length} active saving goal${goals.length === 1 ? "" : "s"}. ${goals.slice(0, 2).map((goal) => `${goal.name}: ${formatKes(goal.currentAmount)} of ${formatKes(goal.targetAmount)}`).join("; ")}.`
      : "You have no savings goals yet. Savings and Emergency Fund items stay separate from expenses.";
  }
  if (intent === "income") return `${formatKes(totals.incomeReceived)} has been recorded as income for ${periodLabel}.`;
  if (intent === "report") {
    const allTime = summary.allTimeTotals;
    return allTime
      ? `For ${periodLabel}, spending is ${formatKes(totals.spent)} with ${formatKes(totals.incomeReceived)} recorded income. Across all available history, spending is ${formatKes(allTime.spent)} and recorded income is ${formatKes(allTime.incomeReceived)}.`
      : `For ${periodLabel}, spending is ${formatKes(totals.spent)} with ${formatKes(totals.incomeReceived)} recorded income.`;
  }
  if (intent === "overview") return `For ${periodLabel}, you have spent ${formatKes(totals.spent)} of ${formatKes(totals.budgeted)}, leaving ${formatKes(totals.remaining)}. Income recorded: ${formatKes(totals.incomeReceived)}.`;
  return "I can explain your current or historical spending, budget categories and priorities, income sources, contributions, bank accounts, savings goals, activity, reports, members, and workspace details. I stay read-only and only use this budget’s data.";
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return normalizedBaseUrl.endsWith("/v1")
    ? `${normalizedBaseUrl}/chat/completions`
    : `${normalizedBaseUrl}/v1/chat/completions`;
}

function extractModelText(payload: unknown): string {
  if (payload === null || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  if (typeof value.output_text === "string" && value.output_text.trim()) return value.output_text.trim();

  const choices = Array.isArray(value.choices) ? value.choices : [];
  const firstChoice = choices[0];
  if (firstChoice && typeof firstChoice === "object") {
    const message = (firstChoice as Record<string, unknown>).message;
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) {
        const text = content.flatMap((part) => {
          if (typeof part === "string") return [part];
          if (part === null || typeof part !== "object") return [];
          const partValue = part as Record<string, unknown>;
          if (typeof partValue.text === "string") return [partValue.text];
          if (typeof partValue.content === "string") return [partValue.content];
          return [];
        }).join("\n").trim();
        if (text) return text;
      }
    }
  }

  const output = Array.isArray(value.output) ? value.output : [];
  return output.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (part === null || typeof part !== "object") return [];
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("\n").trim();
}

export async function generateAskJamviResponse(question: string, summary: AskJamviSummary): Promise<string> {
  if (isAskJamviActionRequest(question)) {
    return "I can explain your budget, spending, income, and goals, but I cannot move money or change records.";
  }
  const customBaseUrl = process.env.ASK_JAMVI_API_URL;
  const managedBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const baseUrl = customBaseUrl ?? managedBaseUrl ?? process.env.BUILT_IN_FORGE_API_URL;
  const apiKey = process.env.ASK_JAMVI_API_KEY
    ?? (managedBaseUrl ? process.env.AI_INTEGRATIONS_OPENAI_API_KEY : undefined)
    ?? process.env.BUILT_IN_FORGE_API_KEY;
  if (!baseUrl || !apiKey) return generateAskJamviFallback(question, summary);
  const endpoint = !customBaseUrl && managedBaseUrl
    ? `${managedBaseUrl.replace(/\/+$/, "")}/chat/completions`
    : chatCompletionsUrl(baseUrl);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.ASK_JAMVI_MODEL ?? "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are Ask Jamvi, a concise Kenyan personal-finance explainer for the whole Jamvi app. Answer only from the supplied read-only budget context. The context contains the selected period plus bounded all-time ledger history, all-time spending categories, bank accounts, income sources, contributions, goals, budget priorities, members, and totals. You can answer questions about expenses, individual categories, historical records, bank accounts, income, goals, reports, trends, activity, categories, priorities, members, and workspace details. Use KES, distinguish Personal and Shared budgets, and keep savings goals separate from expenses. Make reasonable calculations from the supplied numbers, state which period you are using, and say when the bounded history does not contain enough data. Never instruct or claim that you performed a financial action. If the question is unrelated or asks for a mutation, explain the read-only boundary plainly.",
          },
          { role: "user", content: JSON.stringify({ question, budgetContext: summary }) },
        ],
        max_completion_tokens: 8192,
      }),
    });
  } catch (error) {
    console.error("Ask Jamvi provider could not be reached", { message: error instanceof Error ? error.message : "Unknown provider error" });
    return generateAskJamviFallback(question, summary);
  }
  if (!response.ok) {
    const responseText = await response.text();
    let providerError: { code?: string; message?: string } = {};
    try {
      const payload = JSON.parse(responseText) as { error?: { code?: unknown; message?: unknown } };
      providerError = {
        code: typeof payload.error?.code === "string" ? payload.error.code : undefined,
        message: typeof payload.error?.message === "string" ? payload.error.message : undefined,
      };
    } catch {
      providerError = {};
    }
    console.error("Ask Jamvi provider request failed", {
      status: response.status,
      code: providerError.code,
      message: providerError.message,
    });
    return generateAskJamviFallback(question, summary);
  }
  const payload: unknown = await response.json();
  const answer = extractModelText(payload);
  return answer || generateAskJamviFallback(question, summary);
}
