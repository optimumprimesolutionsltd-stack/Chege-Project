import { alreadyFromMpesaMessage } from "./mpesa-import";

type Found = { description: string; date: string; amount: number; receipt?: string | null };

/** One side of what is being typed: money in or out of an account, or into or out of a savings goal. */
export type TypedSide = { amount: number; date: string; direction: "in" | "out"; accountId?: number | null; goalId?: number | null };

/**
 * Before a payment or a move typed by hand is saved: does Jamvi already have it
 * from M-Pesa? Same amount, the same way, within a day either side, and for a
 * savings move the same goal (api-server lib/possible-duplicates). A transfer
 * between accounts is checked on both sides. If anything matches the person is
 * asked, and nothing is saved unless they say it is a different payment. A
 * failed check never stops a save. The phone does the same (mobile-budget
 * lib/alreadyFromMpesa).
 */
export async function confirmNotAlreadyFromMpesa(sides: TypedSide | readonly TypedSide[]): Promise<boolean> {
  const list = Array.isArray(sides) ? sides : [sides as TypedSide];
  let entries: Found[] = [];
  try {
    const response = await fetch("/api/possible-duplicates/check", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        against: "imported",
        items: list.map((side, n) => ({
          key: `typed-${n}`,
          amount: side.amount,
          date: side.date,
          direction: side.direction,
          ...(side.accountId ? { accountId: side.accountId } : {}),
          ...(side.goalId ? { goalId: side.goalId } : {}),
        })),
      }),
    });
    if (!response.ok) return true;
    const body = (await response.json()) as { matches?: Array<{ key: string; entries: Found[] }> };
    entries = (body.matches ?? []).flatMap((match) => match.entries);
  } catch {
    return true;
  }
  if (entries.length === 0) return true;
  const { title, message } = alreadyFromMpesaMessage(entries);
  return window.confirm(`${title}\n\n${message}\n\nPress OK to save it anyway.`);
}
