import {
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from "@workspace/api-client-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function workspaceLabel(workspace: Pick<Workspace, "isPrivate" | "name">) {
  return workspace.isPrivate ? "Personal budget" : `Shared budget · ${workspace.name}`;
}

export function WorkspaceSwitcher({
  activeWorkspaceId,
  className = "",
  id,
  variant = "sidebar",
  showPendingLabel = false,
}: {
  activeWorkspaceId?: number;
  className?: string;
  id?: string;
  variant?: "sidebar" | "dashboard";
  showPendingLabel?: boolean;
}) {
  const { data: workspaces = [] } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const isDashboardVariant = variant === "dashboard";
  const [pendingWorkspace, setPendingWorkspace] = useState<Workspace | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const requestWorkspaceSwitch = (groupId: number) => {
    if (!groupId || groupId === activeWorkspaceId || selectWorkspace.isPending) return;
    const destination = workspaces.find((workspace) => workspace.id === groupId);
    if (destination) {
      setSwitchError(null);
      setPendingWorkspace(destination);
    }
  };

  const confirmWorkspaceSwitch = async () => {
    if (!pendingWorkspace || selectWorkspace.isPending) return;
    try {
      await selectWorkspace.mutateAsync({ data: { groupId: pendingWorkspace.id } });
      // All financial queries use the active workspace. Reloading prevents any
      // cached value from the previously selected budget from being shown.
      window.location.reload();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch budget. Please try again.");
    }
  };

  return (
    <>
      <select
        id={id}
        aria-label="Choose a budget"
        aria-busy={selectWorkspace.isPending}
        value={activeWorkspaceId ?? ""}
        disabled={!activeWorkspaceId || selectWorkspace.isPending}
        onChange={(event) => requestWorkspaceSwitch(Number(event.target.value))}
        className={[
          "max-w-full cursor-pointer outline-none transition-colors disabled:cursor-wait disabled:opacity-70",
          isDashboardVariant
            ? "h-11 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm hover:border-primary/40 focus:ring-2 focus:ring-ring"
            : "h-9 rounded-lg border border-sidebar-border bg-sidebar-accent/70 px-2 text-xs font-semibold text-sidebar-foreground hover:bg-sidebar-accent",
          className,
        ].join(" ")}
      >
        <option value="" disabled>
          Choose a budget
        </option>
        {workspaces
          .slice()
          .sort((a, b) => Number(b.isPrivate) - Number(a.isPrivate) || a.name.localeCompare(b.name))
          .map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspaceLabel(workspace)}
            </option>
          ))}
      </select>
      {showPendingLabel && selectWorkspace.isPending ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground" role="status" aria-live="polite">
            Switching budget…
        </p>
      ) : null}
      <AlertDialog
        open={Boolean(pendingWorkspace)}
        onOpenChange={(open) => {
          if (!open && !selectWorkspace.isPending) {
            setPendingWorkspace(null);
            setSwitchError(null);
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:w-full">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch budget?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to open{" "}
              <span className="font-semibold text-foreground">
                {pendingWorkspace ? workspaceLabel(pendingWorkspace) : "this budget"}
              </span>
              . Your balances, expenses, goals, bank activity, and reports will refresh for that budget.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {switchError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {switchError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selectWorkspace.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={selectWorkspace.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmWorkspaceSwitch();
              }}
            >
              {selectWorkspace.isPending ? "Switching…" : "Switch budget"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}