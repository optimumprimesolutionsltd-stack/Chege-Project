export type AskJamviIntent = "overview" | "spending" | "remaining" | "goals" | "income" | "unknown";

export type AskJamviSummary = {
  period: { month: number; year: number; currency: string };
  workspace: { name: string; isPrivate: boolean };
  totals: { budgeted: number; spent: number; remaining: number; incomeReceived: number };
  categories: Array<{ name: string; budgeted: number; spent: number; remaining: number }>;
  goals: Array<{ name: string; targetAmount: number; currentAmount: number; remaining: number; deadline: string | null }>;
};

export function classifyAskJamviQuery(query: string): AskJamviIntent {
  const value = query.trim().toLocaleLowerCase();
  if (!value) return "unknown";
  if (/(goal|saving|save|emergency|target)/.test(value)) return "goals";
  if (/(income|earn|deposit|received|contribution)/.test(value)) return "income";
  if (/(where|spend|spent|spending|category|categories|most)/.test(value)) return "spending";
  if (/(left|remain|remaining|afford|balance)/.test(value)) return "remaining";
  if (/(how am i|overview|summary|doing|budget|month)/.test(value)) return "overview";
  return "unknown";
}

const kes = (amount: number) => `KES ${Math.round(amount).toLocaleString("en-KE")}`;

export function answerAskJamviQuery(query: string, summary: AskJamviSummary): { intent: AskJamviIntent; text: string } {
  const intent = classifyAskJamviQuery(query);
  const { totals, categories, goals, workspace, period } = summary;
  const periodLabel = new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric" }).format(new Date(period.year, period.month - 1, 1));
  if (intent === "remaining") {
    return { intent, text: totals.remaining >= 0
      ? `${workspace.name} has ${kes(totals.remaining)} left for ${periodLabel}.`
      : `${workspace.name} is over budget by ${kes(Math.abs(totals.remaining))} for ${periodLabel}.` };
  }
  if (intent === "spending") {
    const ranked = categories.filter((category) => category.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 3);
    return { intent, text: ranked.length
      ? `Your highest spending is ${ranked.map((category) => `${category.name} (${kes(category.spent)})`).join(", ")}.`
      : `There is no recorded spending in ${periodLabel} yet.` };
  }
  if (intent === "goals") {
    return { intent, text: goals.length
      ? `You have ${goals.length} active saving goal${goals.length === 1 ? "" : "s"}. ${goals.slice(0, 2).map((goal) => `${goal.name}: ${kes(goal.currentAmount)} of ${kes(goal.targetAmount)}`).join("; ")}.`
      : "You have no savings goals yet. Savings and Emergency Fund items stay separate from expenses." };
  }
  if (intent === "income") return { intent, text: `${kes(totals.incomeReceived)} has been recorded as income for ${periodLabel}.` };
  if (intent === "overview") return { intent, text: `For ${periodLabel}, you have spent ${kes(totals.spent)} of ${kes(totals.budgeted)}, leaving ${kes(totals.remaining)}. Income recorded: ${kes(totals.incomeReceived)}.` };
  return { intent, text: "I can help with your overview, spending, remaining balance, income, or savings goals. Try asking one of those." };
}

export const ASK_JAMVI_PROMPTS = [
  "How am I doing this month?",
  "Where am I spending the most?",
  "How much is left?",
  "What are my savings goals?",
];
