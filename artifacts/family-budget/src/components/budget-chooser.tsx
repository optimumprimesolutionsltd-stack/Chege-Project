import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSharedGroup,
  useGetWorkspaces,
  useSelectWorkspace,
  type GroupKind,
  type Workspace,
} from "@workspace/api-client-react";
import { ArrowUpRight, Award, BriefcaseBusiness, Check, ChevronRight, Heart, Home, Link2, Plus, Star, Users, UsersRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const { data: workspaces = [], isLoading, isError: workspaceLoadFailed, refetch: refetchWorkspaces } = useGetWorkspaces();
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
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);

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
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? personal[0] ?? shared[0] ?? null;
  const selectedName = selectedWorkspace?.isPrivate ? "Personal budget" : selectedWorkspace ? workspaceLabel(selectedWorkspace) : "";
  const selectedDescription = selectedWorkspace?.isPrivate
    ? "A private place for your plans, spending and goals."
    : "A shared place for the people and plans you are building together.";

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-5xl">
        <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl">
          <header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Your Jamvi spaces</p>
            <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">Choose a budget and get to work.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/75 sm:text-base">Jamvi gives each plan a clear place — personal money stays separate, while shared money stays easy for the right people to follow.</p>
          </header>

          <div className="p-6 sm:p-10">
            {selectionError ? <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{selectionError}</p> : null}
            {isLoading ? <div className="h-36 animate-pulse rounded-2xl bg-muted" role="status" aria-label="Loading budgets" /> : workspaceLoadFailed ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center" role="alert">
                <h2 className="font-display text-xl font-bold text-foreground">Your budgets could not load</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Check your connection and try again. Nothing has been changed.</p>
                <Button type="button" variant="outline" className="mt-5 rounded-xl" onClick={() => void refetchWorkspaces()}>Try again</Button>
              </div>
            ) : (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] lg:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Choose your starting space</p>
                  <h2 className="mt-2 font-display text-2xl font-bold text-foreground">Where would you like to begin?</h2>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Select a budget below. You can switch spaces whenever you need to.</p>

                  <div className="mt-6 border-l-2 border-border pl-4">
                    <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-foreground">Personal budget</h3></div>
                    {personal.length ? <div className="grid gap-3">{personal.map((workspace) => <WorkspaceButton key={workspace.id} workspace={workspace} label="Private to you" selected={selectedWorkspace?.id === workspace.id} pending={selectWorkspace.isPending} onChoose={(item) => setSelectedWorkspaceId(item.id)} />)}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Your Personal budget is not ready yet. Try reloading your budgets.</p>}
                  </div>

                  <div className="mt-7 border-l-2 border-border pl-4">
                    <div className="mb-3 flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#087F8C]" /><h3 className="text-sm font-bold text-foreground">Shared budgets</h3></div>
                    {shared.length ? <div className="grid gap-3">{shared.map((workspace) => <WorkspaceButton key={workspace.id} workspace={workspace} label={groupKindPresentation(workspace.kind).label} selected={selectedWorkspace?.id === workspace.id} pending={selectWorkspace.isPending} onChoose={(item) => setSelectedWorkspaceId(item.id)} />)}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No Shared budgets yet. Create one or open an invitation link.</p>}
                  </div>
                </div>

                <aside className="order-first rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 lg:order-none" aria-live="polite">
                  {selectedWorkspace ? <>
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Check className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Selected space</p>
                        <h2 className={`mt-1 truncate font-display text-xl font-bold text-foreground ${selectedWorkspace.isPrivate ? "" : workspaceNameClass(selectedWorkspace.nameStyle)}`}>{selectedName}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selectedDescription}</p>
                      </div>
                    </div>
                    <Button type="button" className="mt-6 h-12 w-full justify-between rounded-xl px-4" disabled={selectWorkspace.isPending} onClick={() => void chooseWorkspace(selectedWorkspace)}>
                      <span>{selectWorkspace.isPending ? "Opening…" : `Open ${selectedName}`}</span><ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </> : <p className="text-sm text-muted-foreground">Choose a budget to see the next step.</p>}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create a Shared budget</Button>
                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setIsJoinOpen(true)}><Link2 className="mr-2 h-4 w-4" />Join a Shared budget</Button>
                  </div>
                  <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">Personal and Shared budgets stay in their own space, so you always know where you are working.</p>
                </aside>
              </div>
            )}
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

function WorkspaceButton({ workspace, label, selected, pending, onChoose }: { workspace: Workspace; label: string; selected: boolean; pending: boolean; onChoose: (workspace: Workspace) => void }) {
  return <button type="button" disabled={pending} aria-pressed={selected} onClick={() => onChoose(workspace)} className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 ${selected ? "border-primary bg-primary/[0.06] ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/50 hover:bg-primary/[0.03]"}`}><WorkspaceIdentity workspace={workspace} /><span className="min-w-0 flex-1"><span className={`block truncate text-base text-foreground ${workspace.isPrivate ? "" : workspaceNameClass(workspace.nameStyle)}`}>{workspace.isPrivate ? "Personal budget" : workspaceLabel(workspace)}</span><span className="mt-1 block text-xs font-medium text-muted-foreground">{label}</span></span><span className={`flex items-center gap-1 text-xs font-bold ${selected ? "text-primary" : "text-muted-foreground"}`}>{selected ? <><Check className="h-4 w-4" />Selected</> : <><span className="hidden sm:inline">Choose</span><ChevronRight className="h-4 w-4" /></>}</span></button>;
}