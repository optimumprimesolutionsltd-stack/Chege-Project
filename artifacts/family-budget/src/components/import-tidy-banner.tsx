import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatKes } from "@/lib/utils";

type TidyReport = {
  chargeCategory: string | null;
  charges: number;
  chargesAmount: number;
  payer: number;
  chargeRows?: Array<{ id: number; amount: number; description: string; date: string }>;
  payerIds?: number[];
};

/**
 * Imported entries an older import filed wrongly in this account, as the
 * phone's Bank offers them: M-Pesa charges under another category, and
 * payments put down to the group. Named one by one, fixed in one click, or
 * left as they are - Jamvi can be wrong, and a choice to leave them is kept on
 * the server so no device offers them again.
 */
export function ImportTidyBanner({ accountId, canManage }: { accountId: number | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"tidy" | "leave" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data, refetch } = useQuery<TidyReport>({
    queryKey: ["import-tidy", accountId],
    queryFn: async () => {
      const response = await fetch(`/api/joint-account/import-tidy?accountId=${accountId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not check imported entries.");
      return response.json();
    },
    enabled: canManage && accountId !== null,
    staleTime: 60_000,
  });
  if (!data || accountId === null) return message ? <p className="text-sm text-muted-foreground">{message}</p> : null;
  const chargeRows = data.chargeCategory ? data.chargeRows ?? [] : [];
  const payerIds = data.payerIds ?? [];
  if (chargeRows.length === 0 && payerIds.length === 0) return message ? <p className="text-sm text-muted-foreground">{message}</p> : null;
  const ids = [...chargeRows.map((row) => row.id), ...payerIds];

  const send = async (kind: "tidy" | "leave") => {
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch(kind === "tidy" ? "/api/joint-account/import-tidy" : "/api/joint-account/import-tidy/keep", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ids }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Please try again.");
      setMessage(kind === "tidy" ? "Tidied. Nothing else about them changed." : "Left as they are. Jamvi won't offer these again.");
      await Promise.all([refetch(), queryClient.invalidateQueries()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm" data-testid="import-tidy-banner">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-foreground">Tidy imported entries?</p>
          {chargeRows.length > 0 ? (
            <div>
              <p>{chargeRows.length} M-Pesa {chargeRows.length === 1 ? "charge" : "charges"} ({formatKes(chargeRows.reduce((sum, row) => sum + row.amount, 0))}) move to {data.chargeCategory}:</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {chargeRows.slice(0, 8).map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span className="truncate">{formatDate(row.date)} · {row.description || "Charge"}</span>
                    <span className="shrink-0">{formatKes(row.amount)}</span>
                  </li>
                ))}
                {chargeRows.length > 8 ? <li>and {chargeRows.length - 8} more</li> : null}
              </ul>
            </div>
          ) : null}
          {payerIds.length > 0 ? <p>{payerIds.length} imported {payerIds.length === 1 ? "payment" : "payments"} recorded as paid by you, not the group.</p> : null}
          <p className="text-xs text-muted-foreground">Nothing else about them changes. If Jamvi has these wrong, leave them as they are and it won't ask again.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => void send("tidy")} disabled={busy !== null} data-testid="import-tidy-apply">
              {busy === "tidy" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Tidy them
            </Button>
            <Button size="sm" variant="outline" onClick={() => void send("leave")} disabled={busy !== null} data-testid="import-tidy-leave">
              {busy === "leave" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Leave as they are
            </Button>
          </div>
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
