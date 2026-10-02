/**
 * What an import says when the server refuses a save because the person"s own
 * trial or subscription has ended.
 *
 * The server answers every entry with the same 402, and the import used to list
 * each one as "Victor Kogi: HTTP 402 : Your Jamvi subscription has lapsed…" -
 * the same sentence seven times, with an error code in front of it. This is
 * the one message shown instead: what happened, that nothing was lost, and
 * what to do.
 *
 * Shared with the web (sync-web-twins.py), so both say it the same way.
 */

/** Whether a failed save was refused for a lapsed trial or subscription. */
export function isLapsedRefusal(error: unknown): boolean {
  if ((error as { status?: number } | null)?.status === 402) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /^HTTP 402\b/.test(message);
}

export type LapsedSaveMessage = { title: string; body: string; action: string };

/**
 * The words for it. `status` is the subscription status the app last read
 * ("trial" when it was the free trial that ran out), `waiting` how many
 * confirmed entries are still to save.
 */
export function lapsedSaveMessage(status: string | null | undefined, waiting: number, isShared: boolean): LapsedSaveMessage {
  const title = status === "trial" ? "Your free trial has ended" : "Your Jamvi subscription has ended";
  const where = isShared ? "this group" : "your budget";
  const kept = waiting > 0
    ? `Your ${waiting} confirmed ${waiting === 1 ? "entry is" : "entries are"} kept here, ready to save.`
    : "Your confirmed entries are kept here, ready to save.";
  return {
    title,
    body: `Jamvi cannot add new entries to ${where} until you pay. Nothing has been lost. ${kept} Pay, then tap Save again.`,
    action: "Pay to continue",
  };
}
