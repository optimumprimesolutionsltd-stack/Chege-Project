/**
 * An account statement for a period.
 *
 * The same document the phone produces, on the screen somebody is more likely
 * to be holding a bank statement beside. Oldest first with a running balance,
 * because that is the only order in which a running balance means anything.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileDown } from "lucide-react";
import { useGetGroup, useGetJointAccounts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Account = { id: number; name: string };

type StatementEntry = {
  id: number;
  date: string;
  description: string;
  detail: string | null;
  moneyIn: number;
  moneyOut: number;
  balance: number;
};

type Statement = {
  accountId: number;
  accountName: string;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  borrowed: number;
  repaidToUs: number;
  lent: number;
  entries: StatementEntry[];
};

function formatKes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0.00";
  return value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The month somebody is most likely to want, which is the one they are in. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

export default function StatementPage() {
  const { toast } = useToast();
  const { data: accountList = [] } = useGetJointAccounts();
  // A PDF is a copy that can be forwarded, so only an owner or admin makes one
  // (the server refuses everybody else). A Personal budget is its owner's.
  const { data: pdfGroup } = useGetGroup();
  const canDownloadPdf = pdfGroup?.isPrivate !== false || pdfGroup?.role === "owner" || pdfGroup?.role === "admin";
  const accounts = accountList as unknown as Account[];

  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [accountId, setAccountId] = useState<number | null>(null);

  const activeAccountId = accountId ?? accounts[0]?.id ?? null;
  const rangeIsBackwards = from > to;

  const { data: statement, isLoading, isError, refetch } = useQuery<Statement>({
    queryKey: ["bank-statement", activeAccountId, from, to],
    queryFn: async () => {
      const response = await fetch(
        `/api/joint-account/statement?accountId=${activeAccountId}&from=${from}&to=${to}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Could not load the statement.");
      return (await response.json()) as Statement;
    },
    enabled: activeAccountId !== null && !rangeIsBackwards,
  });

  const openPdf = () => {
    if (activeAccountId === null) {
      toast({ variant: "destructive", title: "Which account?", description: "Choose the account first." });
      return;
    }
    // A new tab rather than a download: the browser's own viewer is where
    // somebody will read it, and printing from there is one key away.
    window.open(
      `/api/joint-account/statement.pdf?accountId=${activeAccountId}&from=${from}&to=${to}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="statement-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account statement</h1>
        <p className="text-sm text-muted-foreground">
          Oldest first, with a running balance, so it can be read alongside the one your bank sends.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-4">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-semibold text-foreground">Account</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base"
              value={activeAccountId ?? ""}
              onChange={(event) => setAccountId(Number(event.target.value))}
              data-testid="select-statement-account"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">From</span>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 bg-card" data-testid="input-statement-from" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">To</span>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 bg-card" data-testid="input-statement-to" />
          </label>
        </CardContent>
      </Card>

      {rangeIsBackwards ? (
        <p className="text-sm text-destructive" data-testid="statement-bad-range">The period ends before it starts.</p>
      ) : null}

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
      {isError ? (
        <Button type="button" variant="outline" onClick={() => void refetch()} data-testid="statement-retry">
          That did not load. Try again.
        </Button>
      ) : null}

      {statement ? (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-4" data-testid="statement-balances">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">OPENING BALANCE</p>
                <p className="text-lg font-bold text-foreground">{formatKes(statement.openingBalance)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">MONEY IN</p>
                <p className="text-lg font-bold text-emerald-600">{formatKes(statement.totalIn)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">MONEY OUT</p>
                <p className="text-lg font-bold text-destructive">{formatKes(statement.totalOut)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">CLOSING BALANCE</p>
                <p className="text-lg font-bold text-foreground" data-testid="statement-closing">{formatKes(statement.closingBalance)}</p>
              </div>
            </CardContent>
          </Card>

          {statement.borrowed > 0 || statement.repaidToUs > 0 || statement.lent > 0 ? (
            <Card>
              <CardContent className="space-y-1 p-4" data-testid="statement-movement">
                <p className="text-xs font-semibold text-muted-foreground">OF WHICH, NEITHER EARNED NOR SPENT</p>
                {statement.borrowed > 0 ? <p className="text-sm">Borrowed: {formatKes(statement.borrowed)}</p> : null}
                {statement.repaidToUs > 0 ? <p className="text-sm">Paid back to you: {formatKes(statement.repaidToUs)}</p> : null}
                {statement.lent > 0 ? <p className="text-sm">Lent out: {formatKes(statement.lent)}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Inside the totals above, because it really did move the balance.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {canDownloadPdf ? (
            <Button type="button" onClick={openPdf} data-testid="button-statement-pdf">
              <FileDown className="mr-2 h-4 w-4" /> Open as PDF
            </Button>
          ) : null}

          {statement.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="statement-empty">
              Nothing was recorded against this account in that period.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm" data-testid="statement-table">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left font-semibold">Date</th>
                    <th className="p-2 text-left font-semibold">Details</th>
                    <th className="p-2 text-right font-semibold">In</th>
                    <th className="p-2 text-right font-semibold">Out</th>
                    <th className="p-2 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* The opening balance is a row, not a note: read downwards,
                      it is the figure every balance after it is built on. */}
                  <tr className="border-t border-border">
                    <td className="p-2" />
                    <td className="p-2 font-semibold">Opening balance</td>
                    <td className="p-2" />
                    <td className="p-2" />
                    <td className="p-2 text-right font-semibold">{formatKes(statement.openingBalance)}</td>
                  </tr>
                  {statement.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border" data-testid={`statement-row-${entry.id}`}>
                      <td className="p-2 whitespace-nowrap">{entry.date}</td>
                      <td className="p-2">
                        {entry.description}
                        {entry.detail ? <span className="text-muted-foreground"> · {entry.detail}</span> : null}
                      </td>
                      <td className="p-2 text-right text-emerald-600">{entry.moneyIn > 0 ? formatKes(entry.moneyIn) : ""}</td>
                      <td className="p-2 text-right text-destructive">{entry.moneyOut > 0 ? formatKes(entry.moneyOut) : ""}</td>
                      <td className="p-2 text-right">{formatKes(entry.balance)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/50">
                    <td className="p-2" />
                    <td className="p-2 font-bold">Closing balance</td>
                    <td className="p-2 text-right font-bold">{formatKes(statement.totalIn)}</td>
                    <td className="p-2 text-right font-bold">{formatKes(statement.totalOut)}</td>
                    <td className="p-2 text-right font-bold">{formatKes(statement.closingBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
