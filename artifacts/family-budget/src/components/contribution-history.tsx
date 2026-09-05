import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/lib/utils";
import { Loader2, Users } from "lucide-react";

type HistoryMonth = { month: number; year: number; label: string };
type HistoryMember = { userId: string; name: string; amounts: number[]; total: number };
type ContributionHistory = {
  months: HistoryMonth[];
  members: HistoryMember[];
  contributionTotals: number[];
  expenseTotals: number[];
};

const RANGES = [3, 6, 12] as const;

/**
 * Who paid what, month by month, with what the group spent underneath it.
 *
 * The question this answers is "who has slipped", which the rest of the app
 * makes you assemble a month at a time. Members are rows and months are
 * columns because that is the shape of the question - a treasurer reads across
 * one person's row, not down a column.
 */
export function ContributionHistory() {
  const [months, setMonths] = useState<number>(6);

  const { data, isLoading, isError } = useQuery<ContributionHistory>({
    queryKey: ["contribution-history", months],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/contribution-history?months=${months}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load the contribution history.");
      return response.json() as Promise<ContributionHistory>;
    },
    retry: false,
  });

  return (
    <Card className="overflow-hidden border-none shadow-md" data-testid="contribution-history">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
              <Users className="h-5 w-5 text-secondary" aria-hidden="true" />
              Contributions month by month
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What each member has put in, and what the budget spent against it.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {RANGES.map((range) => (
              <Button
                key={range}
                variant={months === range ? "default" : "outline"}
                size="sm"
                onClick={() => setMonths(range)}
                data-testid={`history-range-${range}`}
              >
                {range}m
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This history could not be loaded. Nothing has been changed.
          </p>
        ) : data.members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No contributions have been recorded yet.
          </p>
        ) : (
          // The table scrolls inside its own box: twelve months of columns must
          // never push the whole page sideways.
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-semibold text-muted-foreground">
                    Member
                  </th>
                  {data.months.map((entry) => (
                    <th
                      key={`${entry.year}-${entry.month}`}
                      className="whitespace-nowrap px-3 py-2 text-right font-semibold text-muted-foreground"
                    >
                      {entry.label}
                    </th>
                  ))}
                  <th className="whitespace-nowrap py-2 pl-3 text-right font-semibold text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.userId} className="border-b border-border/50">
                    <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-card py-2 pr-3 font-medium text-foreground">
                      {member.name}
                    </td>
                    {member.amounts.map((amount, column) => (
                      <td
                        key={column}
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                          amount === 0 ? "text-muted-foreground/50" : "text-foreground"
                        }`}
                      >
                        {/* A dash rather than "KES 0": an empty month should
                            read as nothing recorded, not as a payment of zero. */}
                        {amount === 0 ? "—" : formatKes(amount)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-foreground">
                      {formatKes(member.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-semibold text-foreground">
                    Contributions
                  </th>
                  {data.contributionTotals.map((total, column) => (
                    <td key={column} className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                      {formatKes(total)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-foreground">
                    {formatKes(data.contributionTotals.reduce((sum, total) => sum + total, 0))}
                  </td>
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-semibold text-muted-foreground">
                    Expenses
                  </th>
                  {data.expenseTotals.map((total, column) => (
                    <td key={column} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatKes(total)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold tabular-nums text-muted-foreground">
                    {formatKes(data.expenseTotals.reduce((sum, total) => sum + total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
