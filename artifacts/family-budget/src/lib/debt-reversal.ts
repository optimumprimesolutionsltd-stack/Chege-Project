import type { QueryClient } from "@tanstack/react-query";
import { reversalChanges, type DebtEntryLink, type DeletedEntry } from "./debt-links";
import type { DebtCategoryLite, PartyLite } from "./mpesa-debts";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Could not load.");
  return (await response.json()) as T;
}

/** Which people some entries were for, asked before they are deleted. Empty on any trouble: it is only a convenience. */
export async function fetchDebtLinks(ids: number[]): Promise<DebtEntryLink[]> {
  if (ids.length === 0) return [];
  try {
    const body = await getJson<{ links: DebtEntryLink[] }>(`/api/debt-links?ids=${ids.join(",")}`);
    return body.links ?? [];
  } catch {
    return [];
  }
}

/** Records who each debt entry was for, right after saving. Never gets in the way of saving. */
export async function saveDebtLinks(links: DebtEntryLink[]): Promise<void> {
  if (links.length === 0) return;
  try {
    await fetch("/api/debt-links", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    });
  } catch {
    // The entries are saved either way; only the offer to reverse them later is lost.
  }
}

/**
 * After deleting entries: offer to put back the balances they moved.
 * Asked, never applied by itself. Current balances are read fresh, so the offer is
 * measured from what the balance is now.
 */
export async function offerDebtReversal(entries: DeletedEntry[], links: DebtEntryLink[], queryClient: QueryClient): Promise<void> {
  if (entries.length === 0) return;
  let changes;
  try {
    const [parties, categories] = await Promise.all([
      getJson<PartyLite[]>("/api/contributors"),
      getJson<DebtCategoryLite[]>("/api/budget-categories"),
    ]);
    changes = reversalChanges(entries, links, parties, categories);
  } catch {
    return;
  }
  if (changes.length === 0) return;
  const question =
    `${changes.length === 1 ? "Put this balance back?" : `Put ${changes.length} balances back?`}\n\n` +
    `If you updated ${changes.length === 1 ? "it" : "them"} when you saved what you deleted:\n\n${changes.map((change) => `· ${change.label}`).join("\n")}`;
  if (!window.confirm(question)) return;
  try {
    for (const change of changes) {
      const response = await fetch(change.endpoint, {
        method: change.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change.body),
      });
      if (!response.ok) throw new Error("A balance could not be changed.");
    }
    await queryClient.invalidateQueries();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Some balances did not change.");
  }
}
