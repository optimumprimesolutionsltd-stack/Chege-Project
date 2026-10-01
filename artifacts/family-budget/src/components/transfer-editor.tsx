import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export type TransferRow = { id: number; type: string; amount: number; description?: string | null; date: string; bankTransferId?: string | null };

/**
 * Correct a bank-to-bank transfer, as on the phone: its amount, narration and
 * date (both sides change together), or "This wasn't a transfer" - this side
 * kept as ordinary money in or out, the other side removed. The web showed a
 * transfer with no way to change it at all.
 */
export function TransferEditor({
  transfer,
  categoryNames,
  onClose,
  onChanged,
}: {
  transfer: TransferRow | null;
  categoryNames: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [date, setDate] = useState("");
  const [unpairing, setUnpairing] = useState(false);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount(transfer ? String(transfer.amount) : "");
    setNarration(transfer?.description ?? "");
    setDate(transfer?.date.slice(0, 10) ?? "");
    setUnpairing(false);
    setCategory("");
  }, [transfer]);

  if (!transfer) return null;
  const isOut = transfer.type === "disbursement";

  const save = async () => {
    const value = Number(amount.replace(/,/g, ""));
    if (!(value > 0) || !narration.trim() || !date) {
      toast({ variant: "destructive", title: "Not quite ready", description: "Enter a positive amount, a date, and a narration." });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/joint-account/transfers/bank-to-bank/${transfer.bankTransferId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, narration: narration.trim(), date }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Nothing was changed.");
      toast({ title: "Transfer changed", description: "Both sides were updated." });
      onChanged();
      onClose();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change the transfer", description: error instanceof Error ? error.message : "Nothing was changed." });
    } finally {
      setBusy(false);
    }
  };

  const unpair = async () => {
    if (isOut && !category) {
      toast({ variant: "destructive", title: "Choose what it was for", description: "Money out needs a category once it is not a transfer." });
      return;
    }
    if (!window.confirm(`Record this as ordinary ${isOut ? "money out" : "money in"}?\n\nThe matching entry in the other account is removed.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/joint-account/transfers/bank-to-bank/${transfer.bankTransferId}/unpair`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepTransactionId: transfer.id, ...(isOut ? { expenseCategory: category } : {}) }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Nothing was changed.");
      toast({ title: "No longer a transfer", description: `Kept as ${isOut ? "money out" : "money in"}. Edit it like any other entry.` });
      onChanged();
      onClose();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change it", description: error instanceof Error ? error.message : "Nothing was changed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="transfer-editor">
        <DialogHeader>
          <DialogTitle>Edit transfer</DialogTitle>
          <DialogDescription>Both sides of the transfer change together.</DialogDescription>
        </DialogHeader>
        {!unpairing ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm font-semibold text-foreground">
              Amount (KES)
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-10" data-testid="transfer-editor-amount" />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-foreground">
              Narration
              <Input value={narration} onChange={(event) => setNarration(event.target.value)} className="h-10" data-testid="transfer-editor-narration" />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-foreground">
              Date
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10" data-testid="transfer-editor-date" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button type="button" onClick={() => setUnpairing(true)} className="text-sm font-semibold text-primary" data-testid="transfer-not-a-transfer">
                This wasn't a transfer
              </button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button onClick={() => void save()} disabled={busy} data-testid="transfer-editor-save">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3" data-testid="transfer-unpair">
            <p className="text-sm text-foreground">
              This side is kept as ordinary {isOut ? "money out" : "money in"}, and the matching entry in the other account is removed.
            </p>
            {isOut ? (
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
                aria-label="What it was for"
                data-testid="transfer-unpair-category"
              >
                <option value="">Choose what it was for</option>
                {categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUnpairing(false)} disabled={busy}>Back</Button>
              <Button onClick={() => void unpair()} disabled={busy} data-testid="transfer-unpair-confirm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Keep as ${isOut ? "money out" : "money in"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
