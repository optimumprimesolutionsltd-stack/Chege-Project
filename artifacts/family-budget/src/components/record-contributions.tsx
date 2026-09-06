import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatKes } from "@/lib/utils";
import { Loader2, UserPlus } from "lucide-react";

type Contributor = { id: number; name: string; hasAccount: boolean; monthlyTarget: number | null };

/**
 * Recording for the whole group at once.
 *
 * At a meeting almost everybody has paid the usual amount, so this starts from
 * that and lets the treasurer untick the two who have not - rather than typing
 * forty identical figures. It is one deposit with a portion per person, so the
 * group balance moves and every person is credited in the same action.
 *
 * Simple and Advanced work as they do everywhere else: Simple is one amount
 * for everyone, Advanced lets each person differ.
 */
export function RecordContributions({ onRecorded }: { onRecorded?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [each, setEach] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const { data: contributors = [], isLoading } = useQuery<Contributor[]>({
    queryKey: ["contributors"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load contributors.");
      return response.json() as Promise<Contributor[]>;
    },
    retry: false,
  });

  // Everybody starts ticked, because that is the common case. The work is
  // unticking the two who have not paid, not ticking the thirty-eight who have.
  useEffect(() => {
    setTicked(new Set(contributors.map((contributor) => contributor.id)));
    const common = contributors.find((contributor) => contributor.monthlyTarget)?.monthlyTarget;
    if (common && !each) setEach(String(common));
  }, [contributors]);

  const toggle = (id: number) => {
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const amountFor = (contributor: Contributor): number => {
    if (mode === "advanced") {
      const typed = Number(amounts[contributor.id]);
      return Number.isFinite(typed) && typed > 0 ? typed : 0;
    }
    const flat = Number(each);
    return Number.isFinite(flat) && flat > 0 ? flat : 0;
  };

  const chosen = contributors.filter((contributor) => ticked.has(contributor.id));
  const total = chosen.reduce((sum, contributor) => sum + amountFor(contributor), 0);

  const addContributor = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const response = await fetch("/api/contributors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Could not add that name.");
      setNewName("");
      await queryClient.invalidateQueries({ queryKey: ["contributors"] });
    } catch {
      toast({ variant: "destructive", title: "Could not add", description: "That name was not added." });
    } finally {
      setAdding(false);
    }
  };

  const record = async () => {
    const splits = chosen
      .map((contributor) => ({ contributorId: contributor.id, amount: amountFor(contributor) }))
      .filter((split) => split.amount > 0);

    if (splits.length === 0) {
      toast({ variant: "destructive", title: "Nothing to record", description: "Tick at least one person and enter an amount." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/joint-account/deposit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: splits.reduce((sum, split) => sum + split.amount, 0),
          description: `Contributions for ${new Date(year, month - 1, 1).toLocaleString("en-KE", { month: "long", year: "numeric" })}`,
          // The first of the month: the group asks whether somebody has done
          // this month, never which day the money arrived.
          date: new Date(year, month - 1, 1).toISOString().slice(0, 10),
          contributorSplits: splits,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not record these contributions.");

      toast({
        title: "Recorded",
        description: `${splits.length} ${splits.length === 1 ? "person" : "people"} · ${formatKes(total)}`,
      });
      await queryClient.invalidateQueries();
      onRecorded?.();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not record",
        description: error instanceof Error ? error.message : "Nothing has been changed.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-none shadow-md" data-testid="record-contributions">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Record this month</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everyone is ticked to start. Untick anyone who has not paid.
            </p>
          </div>
          <div className="flex shrink-0 gap-1" role="group" aria-label="Entry mode">
            {(["simple", "advanced"] as const).map((option) => (
              <Button
                key={option}
                variant={mode === option ? "default" : "outline"}
                size="sm"
                onClick={() => setMode(option)}
                data-testid={`contribution-mode-${option}`}
              >
                {option === "simple" ? "Simple" : "Advanced"}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Month</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              data-testid="select-contribution-month"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {new Date(2000, index, 1).toLocaleString("en-KE", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Year</span>
            <Input
              type="number"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              data-testid="input-contribution-year"
            />
          </label>
          {mode === "simple" ? (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">Each (KES)</span>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 1000"
                value={each}
                onChange={(event) => setEach(event.target.value)}
                data-testid="input-contribution-each"
              />
            </label>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex min-h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : contributors.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nobody to record yet. Add the people who contribute, below — they do not need the app.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {contributors.map((contributor) => {
              const on = ticked.has(contributor.id);
              return (
                <li key={contributor.id} className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(contributor.id)}
                    disabled={saving}
                    className="h-4 w-4 shrink-0 accent-primary"
                    data-testid={`tick-contributor-${contributor.id}`}
                    aria-label={contributor.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{contributor.name}</span>
                  {mode === "advanced" ? (
                    <Input
                      type="number"
                      min="0"
                      className="h-9 w-28 text-right"
                      placeholder={contributor.monthlyTarget ? String(contributor.monthlyTarget) : "0"}
                      value={amounts[contributor.id] ?? ""}
                      onChange={(event) =>
                        setAmounts((previous) => ({ ...previous, [contributor.id]: event.target.value }))
                      }
                      disabled={!on || saving}
                      data-testid={`amount-contributor-${contributor.id}`}
                    />
                  ) : (
                    <span className={`shrink-0 tabular-nums ${on ? "text-foreground" : "text-muted-foreground/50"}`}>
                      {on && amountFor(contributor) > 0 ? formatKes(amountFor(contributor)) : "—"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Add someone by name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={adding}
            data-testid="input-new-contributor"
          />
          <Button variant="outline" onClick={() => void addContributor()} disabled={adding || !newName.trim()}>
            <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            {adding ? "Adding…" : "Add"}
          </Button>
        </div>

        {/* The number the treasurer reconciles against the cash in hand. It
            never needs scrolling to find. */}
        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
          <span className="text-sm text-muted-foreground">
            {chosen.length} of {contributors.length} ticked
          </span>
          <span className="font-display text-lg font-bold tabular-nums text-foreground" data-testid="contribution-running-total">
            {formatKes(total)}
          </span>
        </div>

        <Button
          className="w-full"
          onClick={() => void record()}
          disabled={saving || total <= 0}
          data-testid="button-record-contributions"
        >
          {saving ? "Recording…" : `Record ${formatKes(total)}`}
        </Button>
      </CardContent>
    </Card>
  );
}
