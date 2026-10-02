import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DebtPayoffCard } from "@/components/debt-payoff-card";
import { formatInterestRate, type PayoffStrategy } from "@/lib/debts";
import { formatMonthKey, projectPayoff, summariseDebts, type DebtWithPayment } from "@/lib/debt-summary";

type Party = { id: number; name: string; owedToUs?: number | null; owedByUs?: number | null };
type CategoryRow = DebtWithPayment & { budgetAmount?: number | null };

const kes = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 0 });

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Could not load this.");
  return response.json() as Promise<T>;
}

/**
 * Debt, given the same standing as savings - the phone's Debt tab
 * (app/(tabs)/debt.tsx), which the web did not have. It leads with the date
 * the debt ends rather than the balance, because the balance is the thing
 * people already know and the date is the thing that keeps them going. People
 * owed and owing from Who owes who sit apart from the payoff plan: they have
 * no monthly amount to work an end date from.
 */
export default function Debt() {
  const [strategy, setStrategy] = useState<PayoffStrategy>("snowball");
  const { data: categories = [], isLoading } = useQuery<CategoryRow[]>({
    queryKey: ["budget-categories-full"],
    queryFn: () => getJson<CategoryRow[]>("/api/budget-categories"),
    staleTime: 30_000,
  });
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: () => getJson<Party[]>("/api/contributors"),
    staleTime: 30_000,
  });

  const debts: DebtWithPayment[] = categories
    .filter((row) => row.debtBalance !== null && row.debtBalance !== undefined)
    .map((row) => ({
      id: row.id,
      name: row.name,
      debtBalance: row.debtBalance,
      debtInterestRateBps: row.debtInterestRateBps ?? null,
      // What a category is budgeted each month is what is being paid towards it.
      monthlyPayment: row.budgetAmount ?? null,
    }));
  const creditors = parties.filter((party) => (party.owedByUs ?? 0) > 0);
  const debtors = parties.filter((party) => (party.owedToUs ?? 0) > 0);
  const owedToPeople = creditors.reduce((total, party) => total + (party.owedByUs ?? 0), 0);

  const view = summariseDebts(debts, strategy);
  const debtFree = formatMonthKey(view.debtFreeOn);
  const clearedEverything = debts.length > 0 && view.totalOwed === 0;

  return (
    <div className="space-y-5 pb-12" data-testid="debt-page">
      <div className="rounded-2xl bg-gradient-to-br from-[#3B0D0D] to-[#5A1717] p-5 text-white">
        <h1 className="text-2xl font-bold">Debt</h1>
        <p className="text-sm text-white/80">Money you owe, and how close you are to paying it off.</p>
        {isLoading ? null : clearedEverything ? (
          <>
            <p className="mt-3 text-3xl font-bold">All clear</p>
            <p className="text-sm text-white/85">Nothing outstanding. That is the whole point.</p>
          </>
        ) : debts.length === 0 ? (
          <p className="mt-3 text-sm text-white/85">
            {owedToPeople > 0
              ? `You owe KES ${kes(owedToPeople)} to people and institutions, below. Mark a budget category as a debt too and Jamvi works out when it ends.`
              : "No debts tracked yet. Mark a budget category as a debt below and Jamvi works out when it ends."}
          </p>
        ) : (
          <>
            <p className="mt-3 text-[11px] font-bold tracking-wide text-white/70">STILL OWED</p>
            <p className="text-3xl font-bold" data-testid="debt-total">KES {kes(view.totalOwed)}</p>
            <p className="text-sm text-white/85">
              {debtFree
                ? `Debt-free by ${debtFree}, paying KES ${kes(view.monthlyCommitment)} a month`
                : view.hasStalledDebt
                  ? "Set a monthly amount on every debt to see when this ends."
                  : `KES ${kes(view.monthlyCommitment)} a month going to debt`}
            </p>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          {view.ranked.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap gap-2" role="tablist">
                {(["snowball", "avalanche"] as const).map((option) => (
                  <button key={option} type="button" role="tab" aria-selected={strategy === option} onClick={() => setStrategy(option)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${strategy === option ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                    data-testid={`debt-strategy-${option}`}>
                    {option === "snowball" ? "Smallest first" : "Costliest first"}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {strategy === "snowball"
                  ? "Smallest balance first — the quick win that keeps a plan going past month one."
                  : "Highest interest first — the least paid to a lender overall."}
              </p>
              {view.ranked.map((row, index) => {
                const balance = row.debtBalance ?? 0;
                const done = balance <= 0;
                const projection = projectPayoff(balance, row.monthlyPayment, row.debtInterestRateBps);
                const clears = formatMonthKey(projection.clearsOn);
                return (
                  <Card key={row.id} data-testid={`debt-row-${row.id}`}>
                    <CardContent className="space-y-1 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">{done ? "Cleared: " : `${index + 1}. `}{row.name}</p>
                        <p className={`text-sm font-bold ${done ? "text-success" : "text-foreground"}`}>{done ? "KES 0" : `KES ${kes(balance)}`}</p>
                      </div>
                      {done ? null : (
                        <p className="text-xs text-muted-foreground">
                          {formatInterestRate(row.debtInterestRateBps)}
                          {row.monthlyPayment ? ` · KES ${kes(row.monthlyPayment)}/mo` : " · no monthly amount set"}
                        </p>
                      )}
                      {done ? null : clears ? (
                        <p className="text-xs font-semibold text-success">
                          Clears {clears}
                          {projection.interestCost ? ` · KES ${kes(projection.interestCost)} interest from here` : ""}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-amber-600">
                          {projection.blockedBy === "no-payment"
                            ? "No end date — nothing is budgeted towards this yet."
                            : "The interest is larger than the monthly amount, so this never reduces."}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          ) : null}

          {creditors.length > 0 || debtors.length > 0 ? (
            <section className="space-y-3" data-testid="debt-parties">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">PEOPLE AND INSTITUTIONS</p>
              {creditors.map((party) => (
                <Card key={`owe-${party.id}`} data-testid={`debt-creditor-${party.id}`}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{party.name}</span><span className="text-xs text-muted-foreground">You owe them</span></span>
                    <span className="text-sm font-bold">KES {kes(party.owedByUs ?? 0)}</span>
                  </CardContent>
                </Card>
              ))}
              {debtors.map((party) => (
                <Card key={`owed-${party.id}`} data-testid={`debt-debtor-${party.id}`}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{party.name}</span><span className="text-xs text-muted-foreground">Owes you</span></span>
                    <span className="text-sm font-bold text-success">KES {kes(party.owedToUs ?? 0)}</span>
                  </CardContent>
                </Card>
              ))}
              <p className="text-xs text-muted-foreground">
                These come from borrowing and lending on Bank accounts. They are not in the payoff plan above: that works out an end
                date from a monthly amount, and these have none.
              </p>
              <Link href="/parties" className="inline-block rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary" data-testid="debt-open-parties">
                Who owes who
              </Link>
            </section>
          ) : null}

          <DebtPayoffCard canManage />
        </>
      )}
    </div>
  );
}
