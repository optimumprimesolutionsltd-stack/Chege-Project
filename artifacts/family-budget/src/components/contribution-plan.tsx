import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatKes } from "@/lib/utils";
import { Loader2, Pencil, Target, Trash2, X } from "lucide-react";

type Contributor = { id: number; name: string; monthlyTarget: number | null };

/**
 * The plan: what each member is expected to give per month. Kept apart from
 * "Record this month", which is only for what actually came in — the expected
 * figure is a target, not a fact, and the two are compared in the variance
 * card below.
 */
export function ContributionPlan() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<{ defaultMonthlyTarget: number | null }>({
    queryKey: ["contribution-settings"],
    queryFn: async () => {
      const response = await fetch("/api/contribution-settings", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the expected amount.");
      return response.json() as Promise<{ defaultMonthlyTarget: number | null }>;
    },
    retry: false,
  });
  const [groupTarget, setGroupTarget] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  useEffect(() => {
    setGroupTarget(settings?.defaultMonthlyTarget != null ? String(settings.defaultMonthlyTarget) : "");
  }, [settings?.defaultMonthlyTarget]);

  const { data: contributors = [], isLoading } = useQuery<Contributor[]>({
    queryKey: ["contributors"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load contributors.");
      return response.json() as Promise<Contributor[]>;
    },
    retry: false,
  });

  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyContributor, setBusyContributor] = useState<number | null>(null);

  const patchContributor = async (id: number, body: Record<string, unknown>): Promise<boolean> => {
    setBusyContributor(id);
    try {
      const response = await fetch(`/api/contributors/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? "Could not save.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contributors"] }),
        queryClient.invalidateQueries({ queryKey: ["contribution-grid"] }),
      ]);
      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: error instanceof Error ? error.message : "Nothing has been changed.",
      });
      return false;
    } finally {
      setBusyContributor(null);
    }
  };

  const saveRename = async (contributor: Contributor) => {
    const name = renameValue.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Enter a name", description: "A contributor needs a name." });
      return;
    }
    if (name === contributor.name) {
      setRenaming(null);
      return;
    }
    if (await patchContributor(contributor.id, { name })) setRenaming(null);
  };

  const removeContributor = async (contributor: Contributor) => {
    const confirmed = window.confirm(
      `Remove ${contributor.name} from this group?\n\n` +
        "Their past contributions stay on record, so earlier totals still add up. " +
        "They drop off this list and the recording form. You can add them again later.",
    );
    if (!confirmed) return;
    if (renaming === contributor.id) setRenaming(null);
    if (editing === contributor.id) setEditing(null);
    if (await patchContributor(contributor.id, { archived: true })) {
      toast({ title: "Removed", description: `${contributor.name} is no longer in this group.` });
    }
  };

  const saveGroupTarget = async (applyToEveryone: boolean) => {
    const raw = groupTarget.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast({ variant: "destructive", title: "Enter an amount", description: "Use a number of zero or more, or leave it blank." });
      return;
    }
    setSavingGroup(true);
    try {
      const response = await fetch("/api/contribution-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultMonthlyTarget: value, applyToEveryone }),
      });
      if (!response.ok) throw new Error("Could not save that amount.");
      await queryClient.invalidateQueries();
      toast({
        title: "Saved",
        description: applyToEveryone
          ? "Everyone is now expected to give this amount."
          : "New members will be expected to give this amount.",
      });
    } catch {
      toast({ variant: "destructive", title: "Could not save", description: "Nothing has been changed." });
    } finally {
      setSavingGroup(false);
    }
  };

  // The parsed group figure, only when the box holds a usable number. The
  // "set everyone" action is hidden until then — clearing every member's
  // amount at once is not something a button should invite by accident.
  const parsedGroupTarget = (() => {
    const raw = groupTarget.trim();
    if (raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  })();

  const applyToAllMembers = async () => {
    if (parsedGroupTarget == null) return;
    const confirmed = window.confirm(
      `Set every member to ${formatKes(parsedGroupTarget)}/mo? This replaces the amount for all ${contributors.length} ` +
        `${contributors.length === 1 ? "member" : "members"} below, including anyone you set individually.`,
    );
    if (!confirmed) return;
    await saveGroupTarget(true);
  };

  const saveMemberTarget = async (contributorId: number) => {
    const raw = editValue.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast({ variant: "destructive", title: "Enter an amount", description: "Use a number of zero or more, or leave it blank." });
      return;
    }
    try {
      const response = await fetch(`/api/contributors/${contributorId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyTarget: value }),
      });
      if (!response.ok) throw new Error("Could not save.");
      setEditing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contributors"] }),
        queryClient.invalidateQueries({ queryKey: ["contribution-grid"] }),
      ]);
    } catch {
      toast({ variant: "destructive", title: "Could not save", description: "That amount was not changed." });
    }
  };

  return (
    <Card className="border-none shadow-md" data-testid="contribution-plan">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <Target className="h-5 w-5 text-secondary" aria-hidden="true" />
            Expected from each member
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The monthly amount the group is working to. It is what arrears and the variance below are measured against —
            leave it blank where giving is voluntary.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <label className="block text-sm font-medium text-foreground" htmlFor="plan-group-target">
            Starting amount for new members
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Anyone you add from now on starts at this amount. It does not change the members already listed below.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="plan-group-target"
              type="number"
              min="0"
              placeholder="e.g. 1000"
              value={groupTarget}
              onChange={(event) => setGroupTarget(event.target.value)}
              disabled={savingGroup}
              className="sm:max-w-40"
              data-testid="input-group-monthly-target"
            />
            <Button variant="outline" onClick={() => void saveGroupTarget(false)} disabled={savingGroup} data-testid="button-save-group-target">
              Save
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-16 items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : contributors.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No contributors yet. Add people on "Record this month", then set what each is expected to give here.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {contributors.map((contributor) => (
              <li key={contributor.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
                {renaming === contributor.id ? (
                  <span className="flex w-full items-center gap-1">
                    <Input
                      autoFocus
                      maxLength={120}
                      className="h-9 flex-1"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveRename(contributor);
                        if (event.key === "Escape") setRenaming(null);
                      }}
                      data-testid={`rename-input-${contributor.id}`}
                    />
                    <Button
                      size="sm"
                      onClick={() => void saveRename(contributor)}
                      disabled={busyContributor === contributor.id}
                    >
                      Save
                    </Button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Cancel rename"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="min-w-0 truncate text-foreground">{contributor.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(contributor.id);
                          setRenameValue(contributor.name);
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`Rename ${contributor.name}`}
                        data-testid={`rename-contributor-${contributor.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>

                    {editing === contributor.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          autoFocus
                          placeholder="blank = no amount"
                          className="h-9 w-32 text-right"
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void saveMemberTarget(contributor.id);
                            if (event.key === "Escape") setEditing(null);
                          }}
                          data-testid={`edit-target-${contributor.id}`}
                        />
                        <Button size="sm" onClick={() => void saveMemberTarget(contributor.id)}>Save</Button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-foreground">
                          {contributor.monthlyTarget != null ? `${formatKes(contributor.monthlyTarget)}/mo` : "Not set"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(contributor.id);
                            setEditValue(contributor.monthlyTarget != null ? String(contributor.monthlyTarget) : "");
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={`Change what ${contributor.name} is expected to give`}
                          data-testid={`edit-contributor-${contributor.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => void removeContributor(contributor)}
                      disabled={busyContributor === contributor.id}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                      aria-label={`Remove ${contributor.name}`}
                      data-testid={`remove-contributor-${contributor.id}`}
                    >
                      {busyContributor === contributor.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {contributors.length > 0 && parsedGroupTarget != null ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Want everyone on the same amount? This overwrites every member above with the starting amount.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void applyToAllMembers()}
              disabled={savingGroup}
              data-testid="button-apply-target-to-everyone"
            >
              Set all {contributors.length} to {formatKes(parsedGroupTarget)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
