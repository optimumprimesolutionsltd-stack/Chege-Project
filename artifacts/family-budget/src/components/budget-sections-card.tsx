import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LayoutList } from "lucide-react";

/** The sections a budget can switch off, in the order they appear in the nav.
 *  Settings, Search and Subscription are absent on purpose: Settings is how a
 *  section gets switched back on, and hiding it would strand an admin outside
 *  their own budget. */
const CHOOSABLE = [
  { id: "contributions", label: "Contributions", hint: "Who has paid, and what the group has collected" },
  { id: "expenses", label: "Expenses", hint: "Money the group has spent" },
  { id: "budget", label: "Budget", hint: "Categories and monthly limits" },
  { id: "activity", label: "Activity", hint: "A running log of what changed" },
  { id: "goals", label: "Savings goals", hint: "Targets the group is saving towards" },
  { id: "bank", label: "Bank accounts", hint: "The group's account and its balance" },
  { id: "reports", label: "Reports", hint: "Monthly summaries and statements" },
] as const;

type SectionId = (typeof CHOOSABLE)[number]["id"];

/**
 * What this budget is for.
 *
 * A chama that only collects money should not be shown nine screens it has no
 * mandate for. Nothing is deleted by switching a section off - it stops
 * appearing in the menu and comes back with its records intact - which is what
 * makes this safe to change on a whim.
 */
export function BudgetSectionsCard({
  enabledSections,
  onSave,
  canManage,
  saving,
}: {
  enabledSections: readonly string[] | undefined;
  onSave: (sections: string[]) => Promise<void>;
  canManage: boolean;
  saving: boolean;
}) {
  const { toast } = useToast();
  const [chosen, setChosen] = useState<Set<string>>(new Set(enabledSections ?? []));

  useEffect(() => {
    setChosen(new Set(enabledSections ?? []));
  }, [enabledSections]);

  if (!canManage) return null;

  const toggle = (id: SectionId) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    // A budget with nothing in it is a budget nobody can use, and the server
    // would quietly hand back every section anyway. Better to say so here than
    // to let somebody save a choice that is silently ignored.
    if (chosen.size === 0) {
      toast({
        variant: "destructive",
        title: "Choose at least one",
        description: "A budget needs at least one section to be usable.",
      });
      return;
    }
    await onSave([...chosen]);
  };

  const unchanged =
    chosen.size === (enabledSections?.length ?? 0) &&
    [...chosen].every((id) => enabledSections?.includes(id));

  return (
    <Card className="border-none shadow-md" data-testid="budget-sections-card">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <LayoutList className="h-5 w-5 text-secondary" aria-hidden="true" />
          <CardTitle>What this budget is for</CardTitle>
        </div>
        <CardDescription>
          Show only the parts this group actually uses. A chama that just collects contributions does not need
          nine screens. Nothing is deleted — switch a section back on and its records are exactly as they were.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 sm:px-6 sm:pb-6">
        {CHOOSABLE.map((section) => {
          const on = chosen.has(section.id);
          return (
            <label
              key={section.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 hover:bg-muted/40"
              data-testid={`section-toggle-${section.id}`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(section.id)}
                disabled={saving}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{section.label}</span>
                <span className="block text-sm text-muted-foreground">{section.hint}</span>
              </span>
            </label>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">
          Settings, Search and Subscription always stay visible, so you can always find your way back here.
        </p>
        <Button onClick={save} disabled={saving || unchanged} data-testid="button-save-sections">
          {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
