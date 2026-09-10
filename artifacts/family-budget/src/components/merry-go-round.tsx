import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetJointAccountQueryKey, getGetJointAccountsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCollapsed } from "@/hooks/use-collapsed";
import { ChevronDown, ChevronUp, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";

type PayoutMember = { id: number; name: string; timesReceived: number; lastRound: number | null };
type Payout = { id: number; roundNumber: number; contributorId: number; name: string; amount: number; date: string; note: string | null };
type PayoutsResponse = {
  enabled: boolean;
  payouts: Payout[];
  nextRound: number;
  totalPaidOut: number;
  members: PayoutMember[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Merry-go-round: the rotating payout a chama runs alongside its contributions.
 * Off by default — a manager turns it on for this budget. It follows the same
 * shape as the other contribution panels: a one-line summary that expands, and
 * the record-a-round form tucked behind an Edit control with Save at the foot.
 */
export function MerryGoRound({ canManage = false }: { canManage?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { open, toggle } = useCollapsed("merry-go-round");
  const [editing, setEditing] = useState(false);

  const { data, isLoading, isError } = useQuery<PayoutsResponse>({
    queryKey: ["payouts"],
    queryFn: async () => {
      const response = await fetch("/api/payouts", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the merry-go-round.");
      return response.json() as Promise<PayoutsResponse>;
    },
    retry: false,
  });

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch("/api/contribution-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merryGoRoundEnabled: enabled }),
      });
      if (!response.ok) throw new Error("Could not change the setting.");
    },
    onSuccess: (_result, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["contribution-settings"] });
      if (!enabled) setEditing(false);
      toast({ title: enabled ? "Merry-go-round turned on" : "Merry-go-round turned off" });
    },
    onError: () => toast({ variant: "destructive", title: "Could not change the setting", description: "Please try again." }),
  });

  const [recipientId, setRecipientId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const resetForm = () => {
    setRecipientId("");
    setAmount("");
    setDate(todayIso());
    setNote("");
  };

  const recordPayout = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/payouts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contributorId: Number(recipientId),
          amount: Math.round(Number(amount)),
          date,
          note: note.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not record the payout.");
      return body as Payout & { name: string };
    },
    onSuccess: (payout) => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["contribution-grid"] });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      resetForm();
      setEditing(false);
      toast({ title: `Round ${payout.roundNumber} recorded`, description: `${formatKes(payout.amount)} to ${payout.name}.` });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Could not record the payout",
        description: error instanceof Error ? error.message : "Please try again.",
      }),
  });

  const deletePayout = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/payouts/${id}`, { method: "DELETE", credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not undo the round.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["contribution-grid"] });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      toast({ title: "Round removed", description: "The payout and its bank withdrawal were reversed." });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Could not undo the round",
        description: error instanceof Error ? error.message : "Please try again.",
      }),
  });

  if (isLoading) {
    return (
      <Card className="border-none shadow-md">
        <CardContent className="flex min-h-24 items-center justify-center p-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) return null;
  if (!data.enabled && !canManage) return null;

  if (!data.enabled) {
    return (
      <Card className="overflow-hidden border-none shadow-md" data-testid="merry-go-round">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-foreground">Merry-go-round</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A rotating payout: each round the group pays one member from the joint account, until everyone has had a turn.
            Turn it on only if your group runs one — it stays off otherwise.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEnabled.mutate(true)}
            disabled={setEnabled.isPending}
            data-testid="enable-merry-go-round"
          >
            {setEnabled.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Turn on for this budget
          </Button>
        </CardContent>
      </Card>
    );
  }

  const waiting = data.members.filter((member) => member.timesReceived === 0);
  const summary =
    data.members.length === 0
      ? "No members yet"
      : `Round ${data.nextRound} next · ${formatKes(data.totalPaidOut)} paid out · ${
          data.members.length - waiting.length
        } of ${data.members.length} have had a turn`;

  return (
    <Card className="overflow-hidden border-none shadow-md" data-testid="merry-go-round">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
            <RefreshCw className="mt-1 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold text-foreground">Merry-go-round</span>
              <span className="mt-1 block text-sm text-muted-foreground">{summary}</span>
            </span>
            {open ? (
              <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
          {open && canManage && !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded p-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Record a round"
              data-testid="edit-merry-go-round"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {open ? (
          <>
            {data.members.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {data.members.map((member) => (
                  <span
                    key={member.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                      member.timesReceived === 0
                        ? "border-secondary/50 bg-secondary/10 font-semibold text-foreground"
                        : "border-border bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {member.name}
                    <span className="tabular-nums">{member.timesReceived === 0 ? "waiting" : `${member.timesReceived}×`}</span>
                  </span>
                ))}
              </div>
            ) : null}

            {data.payouts.length > 0 ? (
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[24rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 pr-3 text-left font-semibold">Round</th>
                      <th className="py-2 pr-3 text-left font-semibold">Member</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Amount</th>
                      <th className="whitespace-nowrap py-2 pl-3 text-right font-semibold">Date</th>
                      {editing && canManage ? <th className="w-8" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.payouts.map((payout) => (
                      <tr key={payout.id} className="border-b border-border/50">
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{payout.roundNumber}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">
                          {payout.name}
                          {payout.note ? <span className="block text-xs font-normal text-muted-foreground">{payout.note}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">{formatKes(payout.amount)}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-muted-foreground">{payout.date}</td>
                        {editing && canManage ? (
                          <td className="py-2 pl-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Undo round ${payout.roundNumber} — ${formatKes(payout.amount)} to ${payout.name}? This reverses the bank withdrawal too.`)) {
                                  deletePayout.mutate(payout.id);
                                }
                              }}
                              disabled={deletePayout.isPending}
                              className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                              aria-label={`Undo round ${payout.roundNumber}`}
                              data-testid={`delete-payout-${payout.id}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold text-foreground">
                      <th className="py-2 pr-3 text-left" colSpan={2}>Paid out</th>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKes(data.totalPaidOut)}</td>
                      <td />
                      {editing && canManage ? <td /> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">No rounds recorded yet.</p>
            )}

            {editing ? (
              <form
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!recipientId || !(Number(amount) > 0)) {
                    toast({ variant: "destructive", title: "Pick a member and an amount above zero." });
                    return;
                  }
                  recordPayout.mutate();
                }}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-medium text-foreground">Pay round {data.nextRound} to</span>
                    <select
                      value={recipientId}
                      onChange={(event) => setRecipientId(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                      data-testid="payout-recipient"
                    >
                      <option value="">Choose a member…</option>
                      {data.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                          {member.timesReceived > 0 ? ` (had ${member.timesReceived})` : " — not yet"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-foreground">Amount (KES)</span>
                    <Input
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="0"
                      data-testid="payout-amount"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-foreground">Date</span>
                    <Input type="date" value={date} max={todayIso()} onChange={(event) => setDate(event.target.value)} data-testid="payout-date" />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-medium text-foreground">Note (optional)</span>
                    <Input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="e.g. paid via M-Pesa" />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Saving records round {data.nextRound} and takes {amount ? formatKes(Number(amount)) : "the amount"} out of the joint account.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { resetForm(); setEditing(false); }} disabled={recordPayout.isPending}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={recordPayout.isPending} data-testid="record-payout">
                    {recordPayout.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Save round {data.nextRound}
                  </Button>
                </div>
              </form>
            ) : canManage ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Turn the merry-go-round off for this budget? The rounds already recorded stay.")) {
                    setEnabled.mutate(false);
                  }
                }}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                data-testid="disable-merry-go-round"
              >
                Turn off the merry-go-round
              </button>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
