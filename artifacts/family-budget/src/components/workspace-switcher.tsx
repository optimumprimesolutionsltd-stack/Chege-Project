import {
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from "@workspace/api-client-react";
import { useGetGroup } from "@workspace/api-client-react";
import { useState } from "react";
import { Award, BriefcaseBusiness, ChevronDown, Heart, Home, Star, Users } from "lucide-react";
import { workspaceIdentityText, workspaceLabel, workspaceNameClass } from "@/lib/workspace-identity";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@workspace/replit-auth-web";
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

export function WorkspaceSwitcher({
  activeWorkspaceId,
  className = "",
  id,
  variant = "sidebar",
  showPendingLabel = false,
  onWorkspaceSwitchRequested,
}: {
  activeWorkspaceId?: number;
  className?: string;
  id?: string;
  variant?: "sidebar" | "dashboard" | "mobile";
  showPendingLabel?: boolean;
  onWorkspaceSwitchRequested?: () => void;
}) {
  const { user } = useAuth();
  const { data: workspaces = [] } = useGetWorkspaces();
  const { data: activeGroup } = useGetGroup();
  const selectWorkspace = useSelectWorkspace();
  const isDashboardVariant = variant === "dashboard";
  const isMobileVariant = variant === "mobile";
  const [pendingWorkspace, setPendingWorkspace] = useState<Workspace | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // The dashboard card names the workspace you are in on its own; the list of
  // the others stays folded away until you ask for it, so the everyday view is
  // one workspace, not a chooser.
  const [dashboardSwitcherOpen, setDashboardSwitcherOpen] = useState(false);
  const activeBrandedBudget = activeGroup ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const ActiveIcon = ({
    users: Users,
    home: Home,
    heart: Heart,
    briefcase: BriefcaseBusiness,
    award: Award,
    star: Star,
  }[activeBrandedBudget?.icon ?? "users"] ?? Users);
  const photoForWorkspace = (workspace: Pick<Workspace, "isPrivate" | "photoUrl">) =>
    workspace.isPrivate ? user?.profileImageUrl ?? null : workspace.photoUrl ?? null;
  const activePhotoUrl = activeBrandedBudget ? photoForWorkspace(activeBrandedBudget) : null;

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
      onWorkspaceSwitchRequested?.();
      // All financial queries use the active workspace. Reloading prevents any
      // cached value from the previously selected workspace from being shown.
      window.location.reload();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch workspace. Please try again.");
    }
  };

  return (
    <>
      {isDashboardVariant ? (
        workspaces.length <= 1 ? null : !dashboardSwitcherOpen ? (
          <button
            type="button"
            onClick={() => setDashboardSwitcherOpen(true)}
            className={`inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline ${className}`}
            data-testid="dashboard-open-workspace-switcher"
          >
            Switch workspace
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
        <div className={`space-y-2 ${className}`}>
        <div
          className="flex w-full snap-x snap-mandatory scroll-p-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-3"
          role="group"
          aria-label="Available workspaces"
        >
          {workspaces
            .slice()
            .sort((a, b) => Number(b.isPrivate) - Number(a.isPrivate) || a.name.localeCompare(b.name))
            .map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              const accentColor = workspace.accentColor ?? "#003383";
              const photoUrl = photoForWorkspace(workspace);
              const WIcon = {
                users: Users,
                home: Home,
                heart: Heart,
                briefcase: BriefcaseBusiness,
                award: Award,
                star: Star,
              }[workspace.icon ?? "users"] ?? Users;

              return (
                <button
                  key={workspace.id}
                  type="button"
                  disabled={selectWorkspace.isPending}
                  aria-pressed={isActive}
                  onClick={() => requestWorkspaceSwitch(workspace.id)}
                  className={`group relative flex shrink-0 snap-start items-center gap-3 rounded-2xl border p-3 pr-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 ${
                    isActive
                      ? "bg-card shadow-md"
                      : "border-border bg-card hover:border-primary/40 hover:bg-accent/10"
                  }`}
                  style={isActive ? {
                    borderColor: accentColor,
                    background: `linear-gradient(135deg, ${accentColor}24 0%, hsl(var(--card)) 68%)`,
                    boxShadow: `0 0 0 1px ${accentColor}40, 0 8px 24px -16px ${accentColor}`,
                  } : undefined}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-3 left-0 w-1 rounded-r-full"
                      style={{ backgroundColor: accentColor }}
                    />
                  ) : null}
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl border-2 object-cover"
                      style={{ borderColor: accentColor, boxShadow: `0 0 0 3px ${accentColor}24` }}
                    />
                  ) : workspace.emoji ? (
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl"
                      style={{ backgroundColor: `${accentColor}24`, borderColor: `${accentColor}66` }}
                    >
                      {workspace.emoji}
                    </span>
                  ) : (
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: workspace.accentColor }}
                    >
                      <WIcon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="flex flex-col justify-center">
                    <span className={`text-sm text-foreground ${workspaceNameClass(workspace.nameStyle)}`}>
                      {workspace.name.trim() || (workspace.isPrivate ? "Personal budget" : "Group")}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {workspace.isPrivate ? "Private" : "Shared"}
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: accentColor }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                          Open
                        </span>
                      ) : null}
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
          <button
            type="button"
            onClick={() => setDashboardSwitcherOpen(false)}
            className="text-xs font-medium text-muted-foreground hover:underline"
          >
            Hide other workspaces
          </button>
        </div>
        )
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          {activeBrandedBudget ? (
            activePhotoUrl ? (
              <img
                src={activePhotoUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-lg border-2 object-cover"
                style={{ borderColor: activeBrandedBudget.accentColor }}
              />
            ) : activeBrandedBudget.emoji ? (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-lg"
                style={{
                  backgroundColor: `${activeBrandedBudget.accentColor}24`,
                  borderColor: `${activeBrandedBudget.accentColor}66`,
                }}
              >
                {activeBrandedBudget.emoji}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: activeBrandedBudget.accentColor }}
              >
                <ActiveIcon className="h-4 w-4" />
              </span>
            )
          ) : null}
          <Select
            value={activeWorkspaceId ? String(activeWorkspaceId) : ""}
            disabled={!activeWorkspaceId || selectWorkspace.isPending}
            onValueChange={(value) => requestWorkspaceSwitch(Number(value))}
          >
            <SelectTrigger
              id={id}
              aria-label="Choose a workspace"
              aria-busy={selectWorkspace.isPending}
              className={[
                `min-w-0 flex-1 cursor-pointer bg-card text-foreground outline-none transition-colors disabled:cursor-wait disabled:opacity-70 ${workspaceNameClass(activeGroup?.nameStyle)}`,
                isMobileVariant
                  ? "h-12 rounded-xl border-2 border-sidebar-border px-4 text-sm font-semibold hover:bg-sidebar-accent"
                  : "h-9 rounded-lg border border-sidebar-border px-2 text-xs hover:bg-sidebar-accent",
                className,
              ].join(" ")}
            >
              <SelectValue placeholder="Choose a workspace">
                {activeWorkspace
                  ? workspaceIdentityText(activeWorkspace, activeWorkspace.isPrivate ? "Personal budget" : "Group")
                  : "Choose a workspace"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="z-[100] border-sidebar-border bg-popover text-popover-foreground">
              {workspaces
                .slice()
                .sort((a, b) => Number(b.isPrivate) - Number(a.isPrivate) || a.name.localeCompare(b.name))
                .map((workspace) => (
                  <SelectItem key={workspace.id} value={String(workspace.id)} className={workspaceNameClass(workspace.nameStyle)}>
                    {workspaceIdentityText(workspace, workspace.isPrivate ? "Personal budget" : "Group")}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {showPendingLabel && selectWorkspace.isPending ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground" role="status" aria-live="polite">
            Switching workspace…
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
        <AlertDialogContent className="z-[100] w-[calc(100%-2rem)] rounded-2xl sm:w-full">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to open{" "}
              <span className="font-semibold text-foreground">
                {pendingWorkspace ? workspaceLabel(pendingWorkspace) : "this workspace"}
              </span>
              . Your balances, expenses, goals, bank activity, and reports will refresh for that workspace.
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
              {selectWorkspace.isPending ? "Switching…" : "Switch workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}