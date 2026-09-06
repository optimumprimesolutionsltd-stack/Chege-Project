import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspacesQueryKey,
  useGetWorkspaces,
  useSelectWorkspace,
  type Workspace,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { groupKindPresentation } from "@/components/group-kind";
import { Check, Loader2, UsersRound, Wallet } from "lucide-react";

/**
 * Everything this person has, in one place.
 *
 * The chooser shows exactly this at onboarding and is then never seen again,
 * after which switching happens through a small dropdown and the budget you
 * are actually in is 10px of grey text beside the logo. Recording a chama
 * contribution into your own budget by mistake is the kind of error that loses
 * trust, so which one you are in should be unmissable and choosing another
 * should not be a hunt.
 *
 * Cards rather than a list: each budget already has an emoji and an accent
 * colour that nothing in the chrome uses, and colour tells them apart before
 * any reading happens.
 */

/** Spelled out rather than assembled, so nobody ever reads "an member". */
function rolePhrase(role: Workspace["role"]): string {
  switch (role) {
    case "owner": return "You own this";
    case "admin": return "You are an admin";
    case "viewer": return "You can view only";
    default: return "You are a member";
  }
}

function WorkspaceCard({
  workspace,
  active,
  pending,
  onChoose,
}: {
  workspace: Workspace;
  active: boolean;
  pending: boolean;
  onChoose: () => void;
}) {
  const kind = groupKindPresentation(workspace.kind);
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={pending}
      data-testid={`workspace-card-${workspace.id}`}
      className={`relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-shadow disabled:cursor-wait ${
        active ? "border-primary shadow-md" : "border-border hover:shadow-md"
      }`}
    >
      {/* The group's own colour, as a band. Two budgets called "Umoja" are told
          apart by this before either name is read. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: workspace.accentColor }}
      />
      <span className="ml-2 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-lg">
        {workspace.photoUrl ? (
          <img src={workspace.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : workspace.emoji ? (
          <span aria-hidden="true">{workspace.emoji}</span>
        ) : workspace.isPrivate ? (
          <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <UsersRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">{workspace.name}</span>
          {active ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Check className="h-3 w-3" aria-hidden="true" /> Open now
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {workspace.isPrivate ? "Private to you" : `${kind.label} · ${rolePhrase(workspace.role)}`}
        </span>
        {workspace.slogan ? (
          <span className="mt-1 block truncate text-xs text-muted-foreground/80">{workspace.slogan}</span>
        ) : null}
      </span>
    </button>
  );
}

export default function MyGroups() {
  const { data: workspaces = [], isLoading } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [choosingId, setChoosingId] = useState<number | null>(null);

  // The server decides which is active, but it does so through a cookie the
  // client cannot read, so "open now" is inferred from the one just chosen or
  // left unmarked. Better unmarked than wrong.
  const [activeId, setActiveId] = useState<number | null>(null);

  const personal = workspaces.filter((workspace) => workspace.isPrivate);
  const groups = workspaces.filter((workspace) => !workspace.isPrivate);

  const choose = async (workspace: Workspace) => {
    if (selectWorkspace.isPending) return;
    setError(null);
    setChoosingId(workspace.id);
    try {
      await selectWorkspace.mutateAsync({ data: { groupId: workspace.id } });
      setActiveId(workspace.id);
      // Everything on screen belongs to the budget that was open a moment ago.
      await queryClient.invalidateQueries();
      await queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() });
      navigate("/");
    } catch {
      setError("That budget could not be opened. Nothing has been changed.");
    } finally {
      setChoosingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="my-groups">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">My budget and groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose one to open it. Everything you record goes into whichever one is open.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">My budget</h2>
        {personal.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {personal.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                active={activeId === workspace.id}
                pending={choosingId === workspace.id}
                onChoose={() => void choose(workspace)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Your own budget is still being prepared.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">My groups</h2>
        {groups.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                active={activeId === workspace.id}
                pending={choosingId === workspace.id}
                onChoose={() => void choose(workspace)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p>You are not in any group yet.</p>
            <p className="mt-1">
              A group is a chama, a church group, a club — anywhere money is collected and spent together.
            </p>
          </div>
        )}
      </section>

      <Button variant="outline" onClick={() => navigate("/settings")} data-testid="button-create-group">
        Create or join a group
      </Button>
    </div>
  );
}
