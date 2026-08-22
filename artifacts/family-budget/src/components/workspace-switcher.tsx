import {
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from "@workspace/api-client-react";

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

  const switchWorkspace = async (groupId: number) => {
    if (!groupId || groupId === activeWorkspaceId) return;
    await selectWorkspace.mutateAsync({ data: { groupId } });
    // All financial queries use the active workspace. Reloading prevents any
    // cached value from the previously selected budget from being shown.
    window.location.reload();
  };

  return (
    <>
      <select
        id={id}
        aria-label="Choose a budget"
        aria-busy={selectWorkspace.isPending}
        value={activeWorkspaceId ?? ""}
        disabled={!activeWorkspaceId || selectWorkspace.isPending}
        onChange={(event) => void switchWorkspace(Number(event.target.value))}
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
    </>
  );
}