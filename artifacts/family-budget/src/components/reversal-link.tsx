import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetReversalQueryKey, useGetReversal, useLinkReversal, useUnlinkReversal } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type Pairing = {
  role: "money_back" | "reversed_payment";
  otherTransactionId: number;
  otherDescription: string;
  otherDate: string;
};

const kes = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 2 });

function day(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Link a money-back deposit to the payment it reversed, or undo the link - as
 * on the phone (mobile-budget components/ReversalLink.tsx). The web only ever
 * linked reversals by itself after an import; one it could not match, or
 * matched wrongly, could be fixed only on a phone.
 *
 * Linked, neither entry counts as income or spending and the balance is
 * untouched. Only a payment of exactly the same amount, dated on or up to 60
 * days before, is offered. On the payment's side there is only a note.
 */
export function ReversalLink({
  transaction,
  canManage,
  onChanged,
}: {
  transaction: { id: number; type: string; amount: number; description?: string | null; reversal?: Pairing | null };
  /** Owners and admins only: the server refuses anybody else. */
  canManage: boolean;
  /** Refresh every balance and total the link changes. */
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isDeposit = transaction.type === "deposit";
  const { data, isLoading } = useGetReversal(transaction.id, {
    query: { queryKey: getGetReversalQueryKey(transaction.id), enabled: isDeposit && canManage },
  });
  const link = useLinkReversal();
  const unlink = useUnlinkReversal();
  const [busy, setBusy] = useState<number | "unlink" | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetReversalQueryKey(transaction.id) });
    onChanged();
  };

  if (!isDeposit) {
    if (transaction.reversal?.role !== "reversed_payment") return null;
    return (
      <div className="space-y-1 rounded-xl border border-border p-3" data-testid="reversal-payment-note">
        <p className="text-sm font-semibold text-foreground">This payment was reversed</p>
        <p className="text-sm text-muted-foreground">
          The money came back on {day(transaction.reversal.otherDate)} ({transaction.reversal.otherDescription}), so neither counts as
          spending or income. To edit or delete this payment, open that money back and unlink it first.
        </p>
      </div>
    );
  }

  if (!canManage || isLoading || !data?.available) return null;

  const doLink = async (originalId: number) => {
    setBusy(originalId);
    try {
      await link.mutateAsync({ id: transaction.id, data: { originalTransactionId: originalId } });
      await refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not link it", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const doUnlink = async () => {
    if (!window.confirm("Unlink this reversal?\n\nThe money back will count as income again, and the payment as spending, with its category back.")) return;
    setBusy("unlink");
    try {
      await unlink.mutateAsync({ id: transaction.id });
      await refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not unlink it", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(null);
    }
  };

  if (data.linked) {
    const original = data.linked;
    return (
      <div className="space-y-2 rounded-xl border border-border p-3" data-testid="reversal-linked">
        <p className="text-sm font-semibold text-foreground">Money back from a reversed payment</p>
        <p className="text-sm text-muted-foreground">
          Reverses {original.description} of KES {kes(original.amount)} on {day(original.date)}
          {original.expenseCategory ? ` (was under ${original.expenseCategory})` : ""}. Neither counts as income or spending.
          Unlink it to edit or delete either entry.
        </p>
        <button type="button" onClick={() => void doUnlink()} disabled={busy !== null} className="text-sm font-semibold text-destructive" data-testid="reversal-unlink">
          {busy === "unlink" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlink"}
        </button>
      </div>
    );
  }

  // Offered only when a payment could be what came back, or the entry already
  // says it is money back - otherwise every deposit would ask the question.
  const saysMoneyBack = /money back|revers/i.test(transaction.description ?? "");
  if (data.candidates.length === 0 && !saysMoneyBack) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-testid="reversal-candidates">
      <p className="text-sm font-semibold text-foreground">Is this money back from a payment that did not go through?</p>
      {data.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="reversal-none">
          No payment of KES {kes(transaction.amount)} was recorded in the 60 days before this, so there is nothing to link it to.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Pick the payment it reversed. Then neither counts as income or spending.</p>
          {data.candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => void doLink(candidate.id)}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left hover:bg-muted"
              data-testid={`reversal-candidate-${candidate.id}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{candidate.description}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {day(candidate.date)}{candidate.expenseCategory ? ` · ${candidate.expenseCategory}` : ""}{candidate.accountName ? ` · ${candidate.accountName}` : ""}
                </span>
              </span>
              {busy === candidate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
