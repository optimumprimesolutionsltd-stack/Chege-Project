import {
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from "@workspace/api-client-react";

export function workspaceLabel(workspace: Pick<Workspace, "isPrivate" | "name">) {
  return workspace.isPrivate ? "My Budget" : workspace.name;
}

export function WorkspaceSwitcher({
  activeWorkspaceId,
  className = "",
}: {
  activeWorkspaceId?: number;
  className?: string;
}) {
  const { data: workspaces = [] } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();

  const switchWorkspace = async (groupId: number) => {
    if (!groupId || groupId === activeWorkspaceId) return;
    await selectWorkspace.mutateAsync({ data: { groupId } });
    // All financial queries use the active workspace. Reloading prevents any
    // cached value from the previously selected budget from being shown.
    window.location.reload();
  };

  return (
    <select
      aria-label="Choose budget workspace"
      value={activeWorkspaceId ?? ""}
      disabled={!activeWorkspaceId || selectWorkspace.isPending}
      onChange={(event) => void switchWorkspace(Number(event.target.value))}
      className={`h-9 max-w-full cursor-pointer rounded-lg border border-sidebar-border bg-sidebar-accent/70 px-2 text-xs font-semibold text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent disabled:cursor-wait disabled:opacity-70 ${className}`}
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
  );
}