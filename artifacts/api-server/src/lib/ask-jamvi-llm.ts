export type AskJamviSummary = {
  period: { month: number; year: number; currency: string };
  workspace: { name: string; isPrivate: boolean };
  totals: { budgeted: number; spent: number; remaining: number; incomeReceived: number };
  categories: Array<{ name: string; budgeted: number; spent: number; remaining: number }>;
  goals: Array<{ name: string; targetAmount: number; currentAmount: number; remaining: number; deadline: string | null }>;
};

const ACTION_REQUEST = /\b(transfer|send|withdraw|deposit|pay|create|add|delete|remove|edit|change|update|save|set a budget)\b|\b(move\s+(?:money|\w+\s+\d+(?:\.\d+)?|\d+(?:\.\d+)?)\b.{0,80}\b(to|into)\b)|\bmove money\b/i;

export function isAskJamviActionRequest(question: string): boolean {
  return ACTION_REQUEST.test(question.trim());
}

export async function generateAskJamviResponse(question: string, summary: AskJamviSummary): Promise<string> {
  if (isAskJamviActionRequest(question)) {
    return "I can explain your budget, spending, income, and goals, but I cannot move money or change records.";
  }
  const baseUrl = process.env.ASK_JAMVI_API_URL ?? process.env.BUILT_IN_FORGE_API_URL;
  const apiKey = process.env.ASK_JAMVI_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Ask Jamvi AI is not configured on this server.");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.ASK_JAMVI_MODEL ?? "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are Ask Jamvi, a concise Kenyan personal-finance explainer. Answer only from the supplied budget context. Use KES, distinguish Personal and Shared budgets, and keep savings goals separate from expenses. Never instruct or claim that you performed a financial action. If the question is not answered by the context, say so plainly.",
        },
        { role: "user", content: JSON.stringify({ question, budgetContext: summary }) },
      ],
      max_completion_tokens: 350,
    }),
  });
  if (!response.ok) throw new Error("Ask Jamvi could not answer right now.");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  const answer = payload.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Ask Jamvi returned an empty answer.");
  return answer;
}
