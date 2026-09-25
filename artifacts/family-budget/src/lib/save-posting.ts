import type { buildPostings } from "./mpesa-import";

/** What one line becomes, as worked out by buildPostings. */
export type Built = NonNullable<ReturnType<typeof buildPostings>>;

type Made = { id: number };

/**
 * The calls that record things, given by whichever app is saving. The phone and the web
 * reach the same server routes through different hooks, so they hand those in and the
 * one function below does the rest, the same way for both.
 */
export type PostingApi = {
  deposit: (data: unknown) => Promise<Made>;
  disbursement: (data: unknown) => Promise<Made>;
  bankToBank: (data: unknown) => Promise<{ outgoing: Made; incoming: Made }>;
  toSavings: (data: unknown) => Promise<Made>;
  fromSavings: (data: unknown) => Promise<Made>;
};

export type Posted = {
  /** The main entry that was created (for a transfer, its M-Pesa side), when there was one. */
  id: number | undefined;
  /** The M-Pesa charge did not save, though the entry itself did. */
  feeFailed: boolean;
};

/**
 * Records one line: the entry itself by whichever route its kind needs, and then its
 * M-Pesa charge, which is its own entry tied to it. An entry that fails throws, so the
 * caller can say which line and why; a charge that fails does not undo the entry it
 * came with, it is only reported.
 *
 * The one place this is decided: a payment, a deposit, a move between accounts and a
 * savings transfer all end the same way, whichever app is saving.
 */
export async function savePosting(built: Built, api: PostingApi, mpesaAccountId: number): Promise<Posted> {
  let id: number | undefined;
  if (built.kind === "deposit") {
    id = (await api.deposit(built.main)).id;
  } else if (built.kind === "savings") {
    id = (built.direction === "out" ? await api.toSavings(built.main) : await api.fromSavings(built.main)).id;
  } else if (built.kind === "transfer") {
    const moved = await api.bankToBank(built.main);
    // The charge belongs with the M-Pesa side of the move.
    id = (built.main.sourceAccountId === mpesaAccountId ? moved.outgoing : moved.incoming).id;
  } else {
    id = (await api.disbursement(built.main)).id;
  }

  if (!built.fee || id === undefined) return { id, feeFailed: false };
  try {
    await api.disbursement({ ...built.fee, chargeForTransactionId: id });
    return { id, feeFailed: false };
  } catch {
    return { id, feeFailed: true };
  }
}
