import { alreadyFromMpesaMessage } from "./mpesa-import";

type Found = { description: string; date: string; amount: number; receipt?: string | null };

/**
 * Before a payment typed by hand is saved: does Jamvi already have it from
 * M-Pesa? Same amount, the same way, within a day either side (api-server
 * lib/possible-duplicates). If so the person is asked, and nothing is saved
 * unless they say it is a different payment. A failed check never stops a save.
 * The phone does the same (mobile-budget lib/alreadyFromMpesa).
 */
export async function confirmNotAlreadyFromMpesa(item: { amount: number; date: string; direction: "in" | "out"; accountId?: number | null }): Promise<boolean> {
  let entries: Found[] = [];
  try {
    const response = await fetch("/api/possible-duplicates/check", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ against: "imported", items: [{ key: "typed", amount: item.amount, date: item.date, direction: item.direction, ...(item.accountId ? { accountId: item.accountId } : {}) }] }),
    });
    if (!response.ok) return true;
    const body = (await response.json()) as { matches?: Array<{ key: string; entries: Found[] }> };
    entries = body.matches?.[0]?.entries ?? [];
  } catch {
    return true;
  }
  if (entries.length === 0) return true;
  const { title, message } = alreadyFromMpesaMessage(entries);
  return window.confirm(`${title}\n\n${message}\n\nPress OK to save it anyway.`);
}
