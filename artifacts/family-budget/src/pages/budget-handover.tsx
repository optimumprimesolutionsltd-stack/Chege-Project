import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetMembersQueryKey,
  useGetGroup,
  useGetMembers,
  useLeaveGroup,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/use-entitlements";
import { SHARED_GROUP_KINDS, type SharedGroupKind } from "@/components/group-kind";
import { mayStartGroup, START_GROUP_NEEDS_SUBSCRIPTION } from "@/lib/group-start";
import { makePersonalBudgetShared, makeSharedConfirmation } from "@/lib/budget-conversion";
import {
  handoverCandidates,
  handoverSteps,
  HANDOVER_INTRO,
  leaveAfterHandoverConfirmation,
  makeOwnerConfirmation,
  mayUseHandover,
  pendingHandoverInvitations,
  type HandoverInvitation,
  type HandoverMember,
  type HandoverStep,
} from "@/lib/budget-handover";
import { appPath } from "@/lib/base-path";
import { workspaceLabel } from "@/lib/workspace-identity";
import { ArrowLeft, Check, Loader2, LogOut, RotateCcw, Send } from "lucide-react";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong. Please try again.");
  return body as T;
}

const INVITATIONS_QUERY_KEY = ["group-invitations"] as const;

type Confirming =
  | { kind: "convert" }
  | { kind: "make-owner"; member: HandoverMember }
  | { kind: "leave" }
  | null;

/**
 * "Give this budget to someone else", one step at a time. Every step here is
 * something Settings could already do; this page only puts them in order and
 * shows which ones are done (lib/budget-handover.ts).
 */
export default function BudgetHandover() {
  const { user } = useAuth();
  const { data: group, isLoading: groupLoading } = useGetGroup();
  const { data: members = [], isLoading: membersLoading } = useGetMembers();
  const { data: entitlements } = useEntitlements();
  const leaveGroup = useLeaveGroup();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isPrivate = group?.isPrivate ?? false;
  const me = members.find((member) => member.userId === user?.id);
  const isManager = me?.role === "owner" || me?.role === "admin";
  const { data: invitations = [] } = useQuery<HandoverInvitation[]>({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: () => requestJson("/api/group-invitations"),
    enabled: Boolean(group) && !isPrivate && isManager,
  });

  const [groupName, setGroupName] = useState("");
  const [groupKind, setGroupKind] = useState<SharedGroupKind | "">("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);

  if (groupLoading || membersLoading || !group) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const input = { isPrivate, userId: user?.id, members, invitations };
  const name = isPrivate ? "Personal budget" : workspaceLabel(group);
  const backLink = (
    <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Settings
    </Link>
  );

  if (!mayUseHandover(input)) {
    return (
      <div className="space-y-4" data-testid="budget-handover">
        {backLink}
        <h1 className="font-display text-2xl font-bold text-foreground">Give this group to someone else</h1>
        <p className="text-sm text-muted-foreground">Only the owner of "{name}" can hand it over.</p>
      </div>
    );
  }

  const steps = handoverSteps(input);
  const candidates = handoverCandidates(input);
  const pending = pendingHandoverInvitations(input);
  const trimmedName = groupName.trim();
  const fail = (title: string, error: unknown) =>
    toast({ variant: "destructive", title, description: error instanceof Error ? error.message : undefined });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetMembersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  ]);

  const startConvert = () => {
    if (entitlements && !mayStartGroup(entitlements)) {
      toast({ variant: "destructive", title: "Subscription needed", description: START_GROUP_NEEDS_SUBSCRIPTION });
      return;
    }
    setConfirming({ kind: "convert" });
  };

  const convert = async () => {
    setBusy(true);
    try {
      await makePersonalBudgetShared(trimmedName, groupKind);
      setConfirming(null);
      // The server moved the open budget along with it; everything cached
      // still describes a Personal budget.
      await queryClient.resetQueries();
      toast({ title: "Now a Shared group", description: `"${trimmedName}" keeps everything it had. Next, invite the new owner.` });
    } catch (error) {
      fail("Could not turn it into a group", error);
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      toast({ variant: "destructive", title: "Enter their email address" });
      return;
    }
    setBusy(true);
    try {
      await requestJson("/api/group-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, role: "member" }),
      });
      setEmail("");
      toast({ title: "Invitation sent", description: `${address} can sign in to Jamvi and accept.` });
      await refresh();
    } catch (error) {
      fail("Could not send invitation", error);
    } finally {
      setBusy(false);
    }
  };

  const resend = async (invitation: HandoverInvitation) => {
    try {
      await requestJson(`/api/group-invitations/${invitation.id}/resend`, { method: "POST" });
      toast({ title: "Invitation resent", description: invitation.email });
    } catch (error) {
      fail("Could not resend invitation", error);
    }
  };

  const makeOwner = async (member: HandoverMember) => {
    setBusy(true);
    try {
      await requestJson(`/api/members/${member.userId}/transfer-ownership`, { method: "POST" });
      setConfirming(null);
      toast({ title: "Ownership handed over", description: `${member.userName ?? "They"} now own "${name}".` });
      await refresh();
    } catch (error) {
      fail("Could not hand over ownership", error);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await leaveGroup.mutateAsync();
      queryClient.clear();
      window.location.assign(`${appPath("/", import.meta.env.BASE_URL)}?left=1`);
    } catch (error) {
      fail("Could not leave group", error);
      setBusy(false);
    }
  };

  const action = (step: HandoverStep) => {
    if (step.state !== "current") return null;
    switch (step.id) {
      case "make-shared":
        return (
          <div className="mt-3 space-y-3">
            <Input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              maxLength={60}
              placeholder="Group name, e.g. Wanjiku's budget"
              aria-label="Group name"
              data-testid="handover-group-name"
            />
            <select
              value={groupKind}
              onChange={(event) => setGroupKind(event.target.value as SharedGroupKind)}
              aria-label="What kind of group is this?"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              data-testid="handover-group-kind"
            >
              <option value="" disabled>What kind of group is this?</option>
              {SHARED_GROUP_KINDS.map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
            <Button onClick={startConvert} disabled={busy || trimmedName.length < 2 || groupKind === ""} data-testid="handover-convert">
              Turn into a Shared group
            </Button>
          </div>
        );
      case "invite":
        return (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => { event.preventDefault(); void invite(); }}
            noValidate
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="their.email@example.com"
              aria-label="New owner's email"
              autoComplete="off"
              data-testid="handover-email"
            />
            <Button type="submit" disabled={busy} className="gap-2" data-testid="handover-invite">
              <Send className="h-4 w-4" aria-hidden="true" /> {busy ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        );
      case "accept":
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refresh()} data-testid="handover-check-again">
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Check again
            </Button>
            {pending.map((invitation) => (
              <Button key={invitation.id} variant="ghost" onClick={() => void resend(invitation)}>
                Resend to {invitation.email}
              </Button>
            ))}
          </div>
        );
      case "make-owner":
        return (
          <div className="mt-3 space-y-2">
            {candidates.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
                <span className="truncate font-medium text-foreground">{member.userName ?? "Member"}</span>
                <Button
                  size="sm"
                  onClick={() => setConfirming({ kind: "make-owner", member })}
                  disabled={busy}
                  data-testid={`handover-make-owner-${member.userId}`}
                >
                  Make owner
                </Button>
              </div>
            ))}
          </div>
        );
      case "leave":
        return (
          <Button
            variant="outline"
            className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming({ kind: "leave" })}
            disabled={busy}
            data-testid="handover-leave"
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Leave group
          </Button>
        );
    }
  };

  const dialog = confirming?.kind === "convert"
    ? { ...makeSharedConfirmation(trimmedName), confirm: "Turn into a group", run: convert }
    : confirming?.kind === "make-owner"
      ? { ...makeOwnerConfirmation(confirming.member.userName ?? "this person"), confirm: "Make owner", run: () => makeOwner(confirming.member) }
      : confirming?.kind === "leave"
        ? { ...leaveAfterHandoverConfirmation(name), confirm: "Leave group", run: leave }
        : null;

  return (
    <div className="space-y-6" data-testid="budget-handover">
      {backLink}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {isPrivate ? "Give this budget to someone else" : "Give this group to someone else"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{HANDOVER_INTRO}</p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            data-testid={`handover-step-${step.id}`}
            data-state={step.state}
            className={`rounded-2xl border p-4 ${step.state === "current" ? "border-primary shadow-md" : "border-border"}`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  step.state === "done"
                    ? "bg-primary text-primary-foreground"
                    : step.state === "current"
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {step.state === "done" ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${step.state === "todo" ? "text-muted-foreground" : "text-foreground"}`}>
                  {step.title}
                  <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (next)" : ""}</span>
                </p>
                {step.state !== "todo" ? <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p> : null}
                {action(step)}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <AlertDialog open={dialog !== null} onOpenChange={(open) => { if (!open && !busy) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              data-testid="handover-confirm"
              onClick={(event) => { event.preventDefault(); void dialog?.run(); }}
            >
              {busy ? "Working…" : dialog?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
