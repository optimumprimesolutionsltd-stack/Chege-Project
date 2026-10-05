/**
 * One M-Pesa import line saved on the server (lib/import-save-jobs): the
 * phone's lib/savePosting, line for line, calling the same routes. No imports,
 * so the phone's tests compare the two directly (serverSaveParity.test.ts).
 */

/** What the phone sends for one line: buildPostings's result, as it is. */
export type Built = {
  kind: "deposit" | "disbursement" | "savings" | "transfer" | "other-budget";
  main: Record<string, unknown>;
  fee?: Record<string, unknown> | null;
  direction?: "in" | "out";
  groupId?: number;
};

/** The person a debt line was with, chosen on the phone: linked once the entry is saved. */
export type JobDebt = { partyId: number; kind: "borrowed" | "pay-back" | "lend" | "repaid" };
export type JobItem = { key: number; built: Built; debt?: JobDebt };

export type ItemResult =
  | { key: number; outcome: "saved"; id?: number; otherBudget?: { groupId: number; id: number }; feeFailed?: boolean }
  | { key: number; outcome: "repeat" }
  | { key: number; outcome: "failed"; why: string }
  | { key: number; outcome: "lapsed" };

/** A refusal from one of the save routes, kept as the route gave it. */
export class RouteRefusal extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`HTTP ${status}`);
  }
}

/** Calls one save route as the person, in the named budget. */
export type RouteCall = (path: string, body: unknown, groupId: number) => Promise<Record<string, unknown>>;

const idOf = (made: Record<string, unknown> | undefined): number | undefined =>
  typeof made?.id === "number" ? made.id : undefined;

/**
 * One line: the entry by the route its kind needs, then its M-Pesa charge tied
 * to it. The phone's lib/savePosting, line for line - a charge that fails does
 * not undo the entry, it is only reported.
 */
export async function saveBuilt(built: Built, call: RouteCall, groupId: number, mpesaAccountId: number) {
  if (built.kind === "other-budget") {
    const otherGroup = Number(built.groupId);
    const made = await call(
      built.direction === "in" ? "/api/joint-account/deposit" : "/api/joint-account/disbursement",
      built.main,
      otherGroup,
    );
    const madeId = idOf(made);
    const otherBudget = madeId !== undefined ? { groupId: otherGroup, id: madeId } : undefined;
    if (!built.fee) return { id: undefined, otherBudget, feeFailed: false };
    try {
      await call("/api/joint-account/disbursement", built.fee, groupId);
      return { id: undefined, otherBudget, feeFailed: false };
    } catch {
      return { id: undefined, otherBudget, feeFailed: true };
    }
  }

  let id: number | undefined;
  if (built.kind === "deposit") {
    id = idOf(await call("/api/joint-account/deposit", built.main, groupId));
  } else if (built.kind === "savings") {
    const path = built.direction === "out" ? "/api/joint-account/transfers/to-savings" : "/api/joint-account/transfers/from-savings";
    id = idOf(await call(path, built.main, groupId));
  } else if (built.kind === "transfer") {
    const moved = await call("/api/joint-account/transfers/bank-to-bank", built.main, groupId);
    // The charge belongs with the M-Pesa side of the move.
    const side = built.main.sourceAccountId === mpesaAccountId ? moved.outgoing : moved.incoming;
    id = idOf(side as Record<string, unknown> | undefined);
  } else {
    id = idOf(await call("/api/joint-account/disbursement", built.main, groupId));
  }

  if (!built.fee || id === undefined) return { id, feeFailed: false };
  try {
    await call("/api/joint-account/disbursement", { ...built.fee, chargeForTransactionId: id }, groupId);
    return { id, feeFailed: false };
  } catch {
    return { id, feeFailed: true };
  }
}

/** Why an entry did not save, in a sentence: the route's own words, never a status code. */
export function plainWhy(error: unknown): string {
  if (error instanceof RouteRefusal) {
    const reason = (error.body as { error?: unknown } | null)?.error;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
    if (error.status >= 500) return "Jamvi's server had a problem saving it. Save it again to try.";
  }
  return "It was not saved. Save it again to try.";
}

export const SIGNED_OUT = "You were signed out before this was saved. Sign in and save it again.";

/** One line saved, put the way the phone reads it back. */
export async function saveItem(item: JobItem, call: RouteCall, groupId: number, mpesaAccountId: number): Promise<ItemResult> {
  try {
    const posted = await saveBuilt(item.built, call, groupId, mpesaAccountId);
    // Who it was with, linked here: the phone used to do it once the whole save
    // had finished, so closing Jamvi mid-save - which a save on the server is
    // meant to allow - left borrowing and lending with nobody behind them.
    // Through the same route the phone uses, as the same person; a link that
    // fails costs only the link, never the entry.
    if (item.debt && posted.id !== undefined && !posted.otherBudget) {
      try {
        await call("/api/debt-links", { links: [{ transactionId: posted.id, partyId: item.debt.partyId, kind: item.debt.kind }] }, groupId);
      } catch {
        // The entry is saved; the link can be made from Who owes who.
      }
    }
    return {
      key: item.key,
      outcome: "saved",
      ...(posted.id !== undefined ? { id: posted.id } : {}),
      ...(posted.otherBudget ? { otherBudget: posted.otherBudget } : {}),
      ...(posted.feeFailed ? { feeFailed: true } : {}),
    };
  } catch (error) {
    if (error instanceof RouteRefusal && error.status === 402) return { key: item.key, outcome: "lapsed" };
    if (error instanceof RouteRefusal && error.status === 401) return { key: item.key, outcome: "failed", why: SIGNED_OUT };
    if (error instanceof RouteRefusal && error.status === 409 && /already recorded/i.test(plainWhy(error))) {
      return { key: item.key, outcome: "repeat" };
    }
    return { key: item.key, outcome: "failed", why: plainWhy(error) };
  }
}

