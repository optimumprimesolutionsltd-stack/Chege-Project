import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/lib/utils";
import { Loader2, Scale } from "lucide-react";
import type { ContributionGrid } from "@/components/contributions-grid";

const RANGES = [1, 3, 6, 12] as const;

/**
 * Expected versus what actually came in, over a chosen stretch of months.
 *
 * Expected is the member's monthly amount times the number of months; given is
 * the plain sum of what was recorded. Variance is given minus expected, so a
 * prepayment nets out and a run of misses shows as one figure — the question
 * is "over the period, did they give what they were meant to", not month by
 * month.
 */
export function ContributionVariance() {
  const [months, setMonths] = useState<number>(6);

  const { data, isLoading, isError } = useQuery<ContributionGrid>({
    queryKey: ["contribution-grid", months],
    queryFn: async () => {
      const response = await fetch(`/api/contributions/grid?months=${months}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the contribution figures.");
      return response.json() as Promise<ContributionGrid>;
    },
    retry: false,
  });

  const monthCount = data?.months.length ?? 0;
  const rows = (data?.rows ?? []).map((row) => {
    const given = row.amounts.reduce((sum, amount) => sum + amount, 0);
    const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : null;
    return {
      name: row.name,
      expected,
      given,
      variance: expected != null ? given - expected : null,
    };
  });
  const totalExpected = rows.reduce((sum, row) => sum + (row.expected ?? 0), 0);
  const totalGiven = rows.reduce((sum, row) => sum + row.given, 0);

  const varianceCell = (value: number | null) => {
    if (value == null) return <span className="text-muted-foreground/60">—</span>;
    if (value === 0) return <span className="text-muted-foreground">On plan</span>;
    return (
      <span className={value > 0 ? "text-success" : "text-destructive"}>
        {value > 0 ? "+" : "−"}
        {formatKes(Math.abs(value))}
      </span>
    );
  };

  return (
    <Card className="overflow-hidden border-none shadow-md" data-testid="contribution-variance">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
              <Scale className="h-5 w-5 text-secondary" aria-hidden="true" />
              Expected vs actual
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What each member was expected to give over the last {months} months, against what they gave.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {RANGES.map((range) => (
              <Button
                key={range}
                variant={months === range ? "default" : "outline"}
                size="sm"
                onClick={() => setMonths(range)}
                data-testid={`variance-range-${range}`}
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
          <p className="py-6 text-center text-sm text-muted-foreground">These figures could not be loaded.</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No contributors yet.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-semibold">Member</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Expected</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Given</th>
                  <th className="whitespace-nowrap py-2 pl-3 text-right font-semibold">Variance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-border/50">
                    <td className="max-w-[10rem] truncate py-2 pr-3 font-medium text-foreground">{row.name}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {row.expected != null ? formatKes(row.expected) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">
                      {formatKes(row.given)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-medium tabular-nums">
                      {varianceCell(row.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-foreground">
                  <th className="py-2 pr-3 text-left">Group</th>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatKes(totalExpected)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKes(totalGiven)}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">
                    {varianceCell(totalExpected > 0 ? totalGiven - totalExpected : null)}
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
