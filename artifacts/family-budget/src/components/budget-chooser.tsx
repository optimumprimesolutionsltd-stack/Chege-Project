import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSharedGroup,
  useGetWorkspaces,
  useSelectWorkspace,
  type GroupKind,
  type Workspace,
} from "@workspace/api-client-react";
import { Award, BriefcaseBusiness, Heart, Home, Link2, Plus, Star, Users, UsersRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SHARED_GROUP_KINDS, groupKindPresentation, type SharedGroupKind } from "@/components/group-kind";
import { workspaceLabel, workspaceNameClass } from "@/lib/workspace-identity";

const CHOOSER_STORAGE_PREFIX = "jamvi:budget-chooser:completed:";

export function budgetChooserCompletionKey(userId: string) {
  return `${CHOOSER_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function hasCompletedBudgetChooser(userId: string): boolean {
  try {
    return window.localStorage.getItem(budgetChooserCompletionKey(userId)) === "true";
  } catch {
    // Privacy settings and unavailable storage must never accidentally skip setup.
    return false;
  }
}

function markBudgetChooserComplete(userId: string) {
  try {
    window.localStorage.setItem(budgetChooserCompletionKey(userId), "true");
  } catch {
    // On the next visit the chooser is deliberately shown again.
  }
}

function WorkspaceIdentity({ workspace }: { workspace: Workspace }) {
  const Icon = ({
    users: Users,
    home: Home,
    heart: Heart,
    briefcase: BriefcaseBusiness,
    award: Award,
    star: Star,
  }[workspace.icon] ?? Users);
  const accent = workspace.accentColor ?? "#003383";

  if (workspace.photoUrl) {
    return <img src={workspace.photoUrl} alt="" className="h-12 w-12 rounded-xl border-2 object-cover" style={{ borderColor: accent }} />;
  }
  if (workspace.emoji) {
    return <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl border text-2xl" style={{ backgroundColor: `${accent}24`, borderColor: `${accent}66` }}>{workspace.emoji}</span>;
  }
  return <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><Icon className="h-5 w-5" /></span>;
}

export function BudgetChooser({
  user,
}: {
  user: { id?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null; profileImageUrl?: string | null };
}) {
  const { data: workspaces = [], isLoading } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const createSharedGroup = useCreateSharedGroup();
  const queryClient = useQueryClient();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SharedGroupKind | null>(null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const userId = user.id ?? "";
  const signedInName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "there";

  const enterApp = () => {
    if (userId) markBudgetChooserComplete(userId);
    queryClient.clear();
    window.location.reload();
  };

  const chooseWorkspace = async (workspace: Workspace) => {
    if (selectWorkspace.isPending) return;
    setSelectionError(null);
    try {
      // The only ID sent comes from the server-returned workspace list.
      await selectWorkspace.mutateAsync({ data: { groupId: workspace.id } });
      enterApp();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Could not open that budget. Please try again.");
    }
  };

  const createSharedBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setSelectionError("Enter at least two characters for the Shared budget name.");
      return;
    }
    if (!kind) {
      setSelectionError("Choose what this Shared budget is for.");
      return;
    }
    setSelectionError(null);
    try {
      await createSharedGroup.mutateAsync({ data: { name: name.trim(), kind: kind as GroupKind } });
      enterApp();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Could not create the Shared budget. Please try again.");
    }
  };

  const openInvitation = (event: FormEvent) => {
    event.preventDefault();
    setLinkError(null);
    try {
      const invitationUrl = new URL(link.trim(), window.location.origin);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const appPath = base && invitationUrl.pathname.startsWith(`${base}/`)
        ? invitationUrl.pathname.slice(base.length)
        : invitationUrl.pathname;
      if (invitationUrl.origin !== window.location.origin || !/^\/(?:invite|join)\/[^/]+\/?$/.test(appPath)) {
        throw new Error("Paste a Jamvi email invitation or private group link.");
      }
      queryClient.clear();
      window.location.assign(`${invitationUrl.pathname}${invitationUrl.search}${invitationUrl.hash}`);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "Could not open that invitation.");
    }
  };

  const personal = workspaces.filter((workspace) => workspace.isPrivate);
  const shared = workspaces.filter((workspace) => !workspace.isPrivate).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-3xl">
        <div className="rounded-3xl border border-primary/15 bg-card p-6 shadow-xl sm:p-10">
          <div className="flex items-start gap-4">
            <ProfileAvatar user={user} alt="" className="h-14 w-14 border-2 border-primary/20" textClassName="text-lg" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Welcome to Jamvi</p>
              <h1 className="mt-1 font-display text-3xl font-bold text-foreground sm:text-4xl">Hello, {signedInName}</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Choose a budget to open. Your Personal budget stays private; Shared budgets are visible only to their members.</p>
            </div>
          </div>

          {selectionError ? <p className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{selectionError}</p> : null}
          {isLoading ? <div className="mt-8 h-36 animate-pulse rounded-2xl bg-muted" role="status" aria-label="Loading budgets" /> : (
            <div className="mt-8 space-y-7">
              <div>
                <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /><h2 className="font-display text-lg font-bold text-foreground">My Budget</h2></div>
                <div className="grid gap-3">
                  {personal.map((workspace) => <WorkspaceButton key={workspace.id} workspace={workspace} label="Personal · only you" pending={selectWorkspace.isPending} onChoose={chooseWorkspace} />)}
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#087F8C]" /><h2 className="font-display text-lg font-bold text-foreground">Shared budgets</h2></div>
                {shared.length ? <div className="grid gap-3">{shared.map((workspace) => <WorkspaceButton key={workspace.id} workspace={workspace} label={groupKindPresentation(workspace.kind).label} pending={selectWorkspace.isPending} onChoose={chooseWorkspace} />)}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No Shared budgets yet. Create one or open an invitation link.</p>}
              </div>
            </div>
          )}
          <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
            <Button type="button" className="h-11 flex-1 rounded-xl" onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create a Shared budget</Button>
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setIsJoinOpen(true)}><Link2 className="mr-2 h-4 w-4" />Join a Shared budget</Button>
          </div>
        </div>
      </section>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Create a Shared budget</DialogTitle></DialogHeader>
        <form onSubmit={createSharedBudget} className="space-y-5">
          <div className="space-y-2"><label htmlFor="chooser-group-name" className="text-sm font-semibold">Group name</label><Input id="chooser-group-name" autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mwangaza Chama" /></div>
          <fieldset className="space-y-2"><legend className="text-sm font-semibold">What kind of group is this?</legend><div className="grid gap-2 sm:grid-cols-2">{SHARED_GROUP_KINDS.map((option) => <button key={option.value} type="button" aria-pressed={kind === option.value} onClick={() => setKind(option.value)} className={`rounded-xl border p-3 text-left ${kind === option.value ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs text-muted-foreground">{option.description}</span></button>)}</div></fieldset>
          <Button type="submit" className="w-full" disabled={createSharedGroup.isPending}>{createSharedGroup.isPending ? "Creating…" : "Create Shared budget"}</Button>
        </form>
      </DialogContent></Dialog>
      <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Join a Shared budget</DialogTitle></DialogHeader>
        <form onSubmit={openInvitation} className="space-y-5"><p className="text-sm leading-relaxed text-muted-foreground">Paste the Jamvi email invitation or private group link you received.</p><div className="space-y-2"><label htmlFor="chooser-invitation-link" className="text-sm font-semibold">Invitation link</label><Input id="chooser-invitation-link" autoFocus value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…/invite/…" /></div>{linkError ? <p className="text-sm text-destructive" role="alert">{linkError}</p> : null}<Button type="submit" className="w-full">Open invitation</Button></form>
      </DialogContent></Dialog>
    </main>
  );
}

function WorkspaceButton({ workspace, label, pending, onChoose }: { workspace: Workspace; label: string; pending: boolean; onChoose: (workspace: Workspace) => void }) {
  return <button type="button" disabled={pending} onClick={() => void onChoose(workspace)} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"><WorkspaceIdentity workspace={workspace} /><span className="min-w-0 flex-1"><span className={`block truncate text-base text-foreground ${workspaceNameClass(workspace.nameStyle)}`}>{workspaceLabel(workspace)}</span><span className="mt-1 block text-xs font-medium text-muted-foreground">{label}</span></span><span className="text-sm font-semibold text-primary">{pending ? "Opening…" : "Open"}</span></button>;
}