/**
 * One party paying another, through your account.
 *
 * Kamau owes you; you owe Mwangi. Kamau's money lands in your account and
 * leaves again to Mwangi the same day, and none of it was ever yours. Two
 * debts fall by the same amount and the balance ends where it started.
 *
 * Both halves can be recorded one at a time on the bank page, but that means
 * entering the same amount twice and remembering that neither is income nor
 * spending. Miss the marking on either and the month gains money that was
 * never earned, or spending that never happened.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Repeat } from "lucide-react";
import {
  useCreateDeposit,
  useCreateDisbursement,
  useGetGroup,
  useGetJointAccounts,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";

type Party = {
  id: number;
  name: string;
  owedToUs?: number | null;
  owedByUs?: number | null;
};

type Account = { id: number; name: string };

function formatKes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "KES 0";
  return `KES ${value.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function readAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PassThroughPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Account[];
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load creditors and debtors.");
      return (await response.json()) as Party[];
    },
    staleTime: 30_000,
  });

  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();

  const [payerId, setPayerId] = useState("none");
  const [payeeId, setPayeeId] = useState("none");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const payer = parties.find((party) => String(party.id) === payerId) ?? null;
  const payee = parties.find((party) => String(party.id) === payeeId) ?? null;
  const activeAccountId = accountId ?? accounts[0]?.id ?? null;
  const parsedAmount = useMemo(() => (amount.trim() === "" ? null : readAmount(amount)), [amount]);

  const save = async () => {
    if (!activeAccountId) {
      toast({ variant: "destructive", title: "Which account?", description: "Choose the account the money passed through." });
      return;
    }
    if (!payer || !payee) {
      toast({ variant: "destructive", title: "Who paid whom?", description: "Pick the one paying and the one being paid." });
      return;
    }
    if (payer.id === payee.id) {
      // Somebody paying themselves through your account is not a thing, and
      // the two balance changes would fight over the same row.
      toast({ variant: "destructive", title: "They are the same person", description: "Pick two different people." });
      return;
    }
    if (parsedAmount === null || parsedAmount <= 0) {
      toast({ variant: "destructive", title: "How much?", description: "Enter an amount, with up to two decimals." });
      return;
    }
    const total = toMoney(parsedAmount);
    const narration = note.trim() || `${payer.name} to ${payee.name}`;

    setSaving(true);
    try {
      // In first, in the order it happened. If the second fails, what stands
      // is a repayment that really did reach the account — true, and
      // correctable — rather than a payment made from money never received.
      await createDeposit.mutateAsync({
        data: {
          amount: total,
          description: narration,
          date,
          madeById: !isSharedWorkspace ? user?.id : null,
          settlesContributorId: payer.id,
          accountId: activeAccountId,
        },
      });
      await createDisbursement.mutateAsync({
        data: {
          amount: total,
          description: narration,
          date,
          madeById: !isSharedWorkspace ? user?.id : null,
          accountId: activeAccountId,
          // Not spending: the money was never yours to spend.
          isLending: true,
        },
      });

      const owedToUs = typeof payer.owedToUs === "number" ? payer.owedToUs : 0;
      const owedByUs = typeof payee.owedByUs === "number" ? payee.owedByUs : 0;
      const payerLeft = Math.max(0, toMoney(owedToUs - total));
      const payeeLeft = Math.max(0, toMoney(owedByUs - total));
      const question =
        `Update both balances?\n\n` +
        `· ${payer.name}: owes you ${formatKes(owedToUs)} → ${formatKes(payerLeft)}\n` +
        `· ${payee.name}: you owe ${formatKes(owedByUs)} → ${formatKes(payeeLeft)}\n\n` +
        `Both postings are saved either way.`;
      if (window.confirm(question)) {
        await fetch(`/api/contributors/${payer.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owedToUs: payerLeft }),
        });
        await fetch(`/api/contributors/${payee.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owedByUs: payeeLeft }),
        });
        await queryClient.invalidateQueries({ queryKey: ["parties"] });
      }
      toast({ title: "Both postings recorded" });
      setAmount("");
      setNote("");
    } catch (error) {
      toast({ variant: "destructive", title: "Could not record it", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="pass-through-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paid through your account</h1>
        <p className="text-sm text-muted-foreground">
          Somebody who owes you settling with somebody you owe, their money passing through your account on the way.
          Two debts fall, and your balance ends where it started.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Who is paying</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base"
              value={payerId}
              onChange={(event) => setPayerId(event.target.value)}
              data-testid="select-payer"
            >
              <option value="none">Choose somebody</option>
              {parties.map((party) => (
                <option key={party.id} value={String(party.id)}>
                  {party.name} — owes you {formatKes(party.owedToUs ?? 0)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Who is being paid</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base"
              value={payeeId}
              onChange={(event) => setPayeeId(event.target.value)}
              data-testid="select-payee"
            >
              <option value="none">Choose somebody</option>
              {parties.map((party) => (
                <option key={party.id} value={String(party.id)}>
                  {party.name} — you owe {formatKes(party.owedByUs ?? 0)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Amount</span>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 6000" className="h-10 bg-card" data-testid="input-pass-through-amount" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Date</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 bg-card" data-testid="input-pass-through-date" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Account</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base"
              value={activeAccountId ?? ""}
              onChange={(event) => setAccountId(Number(event.target.value))}
              data-testid="select-pass-through-account"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Note (optional)</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What it was for" className="h-10 bg-card" data-testid="input-pass-through-note" />
          </label>
        </CardContent>
      </Card>

      {payer && payee && parsedAmount !== null && parsedAmount > 0 ? (
        <Card>
          <CardContent className="space-y-1 p-4" data-testid="pass-through-preview">
            <p className="font-semibold text-foreground">
              <Repeat className="mr-2 inline h-4 w-4" />
              {formatKes(toMoney(parsedAmount))} in from {payer.name}, straight out to {payee.name}.
            </p>
            <p className="text-sm text-muted-foreground">
              Your balance ends where it started. Neither half counts as income or spending — the money was never yours.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Button type="button" onClick={() => void save()} disabled={saving} data-testid="button-pass-through-save">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record both postings"}
      </Button>
    </div>
  );
}
