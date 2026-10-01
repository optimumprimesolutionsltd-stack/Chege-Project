export type MpesaName = { transactionId: number; name: string };

/**
 * The name M-Pesa gave an entry, when it was saved under another name (a
 * nickname for the payee) - kept so Search finds "naivas" in an entry saved
 * as "Supermarket". Null when the saved name is already M-Pesa's own.
 */
export function mpesaNameFor(transactionId: number | null | undefined, original: string | null | undefined, saved: string | null | undefined): MpesaName | null {
  const name = original?.trim();
  if (!transactionId || !name || name.toLocaleLowerCase() === (saved ?? "").trim().toLocaleLowerCase()) return null;
  return { transactionId, name };
}

/** Sends them after a save. Never gets in the way of saving: the entries are saved either way. */
export async function saveMpesaNames(names: MpesaName[]): Promise<void> {
  if (names.length === 0) return;
  try {
    await fetch("/api/mpesa-names", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
  } catch {
    // Only Search by the old name is lost.
  }
}
