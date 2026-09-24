export type Tone = "good" | "careful" | "over" | "neutral";

export type HomeAnswers = {
  /** "How much do I have?" — the bank balance, or null when there is no account yet. */
  have: number | null;
  /** "What did I spend this month?" */
  spent: number;
  /** "Am I on track?" in a sentence, and how to colour it. */
  track: { tone: Tone; text: string };
};

const kes = (value: number) =>
  Math.round(Math.abs(value)).toLocaleString("en-KE");

/**
 * The three things anybody opening the app wants to know, in plain words.
 * Everything else on Home is detail behind these.
 */
export function homeAnswers(input: {
  balance: number | null | undefined;
  spent: number | null | undefined;
  budget: number | null | undefined;
}): HomeAnswers {
  const spent = input.spent ?? 0;
  const budget = input.budget ?? 0;
  const have = typeof input.balance === "number" ? input.balance : null;

  if (budget <= 0) {
    return { have, spent, track: { tone: "neutral", text: "Set a budget to see if you are on track" } };
  }
  const left = budget - spent;
  if (left < 0) {
    return { have, spent, track: { tone: "over", text: `You are over budget by KES ${kes(left)}` } };
  }
  if (spent / budget >= 0.8) {
    return { have, spent, track: { tone: "careful", text: `Careful: only KES ${kes(left)} left this month` } };
  }
  return { have, spent, track: { tone: "good", text: `On track: KES ${kes(left)} left this month` } };
}
