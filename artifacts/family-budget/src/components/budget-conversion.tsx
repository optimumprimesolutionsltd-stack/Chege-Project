import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetGroup } from "@workspace/api-client-react";
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
import {
  canRemovePersonalBudget,
  fetchPersonalBudgetStatus,
  makeGroupPersonal,
  makePersonalBudgetShared,
  makePersonalConfirmation,
  makeSharedConfirmation,
  MAKE_SHARED_WARNING,
  PERSONAL_STATUS_QUERY_KEY,
  removeUnusedPersonalBudget,
  REMOVE_PERSONAL_CONFIRMATION,
} from "@/lib/budget-conversion";
import { Trash2, UserRound, UsersRound } from "lucide-react";

export function usePersonalBudgetStatus() {
  return useQuery({ queryKey: PERSONAL_STATUS_QUERY_KEY, queryFn: fetchPersonalBudgetStatus });
}

/**
 * After a conversion or removal the server has already moved the active
 * budget (its cookie). Every cached answer still describes the old one -
 * whether it is Personal decides the menu, Contributions, members and the
 * "My"/"Group" labels - so all of it is reset before Home opens.
 */
function useSettle() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return async () => {
    await queryClient.resetQueries();
    navigate("/");
  };
}

/** In a Personal budget: turn it into a Shared group, in place. */
export function TurnPersonalIntoGroup() {
  const { data: entitlements } = useEntitlements();
  const { toast } = useToast();
  const settle = useSettle();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SharedGroupKind | "">("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const ready = trimmed.length >= 2 && kind !== "";
  const confirmation = makeSharedConfirmation(trimmed);

  const start = () => {
    if (entitlements && !mayStartGroup(entitlements)) {
      toast({ variant: "destructive", title: "Subscription needed", description: START_GROUP_NEEDS_SUBSCRIPTION });
      return;
    }
    setOpen(true);
  };

  const convert = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await makePersonalBudgetShared(trimmed, kind);
      setConfirming(false);
      setOpen(false);
      toast({ title: "Now a Shared group", description: `"${trimmed}" keeps everything it had. Invite people when you're ready.` });
      await settle();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not turn it into a group",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-4" data-testid="turn-personal-into-group">
      <p className="text-sm font-semibold text-foreground">Turn into a shared group</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Keeps everything recorded here and lets you invite people. {MAKE_SHARED_WARNING}
      </p>
      {!open ? (
        <Button variant="outline" className="mt-3" onClick={start} data-testid="button-turn-into-group">
          <UsersRound className="mr-2 h-4 w-4" /> Turn into a shared group
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Group name, e.g. Lydiah and Chege"
            aria-label="Group name"
            data-testid="input-convert-group-name"
          />
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SharedGroupKind)}
            aria-label="What kind of group is this?"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            data-testid="select-convert-group-kind"
          >
            <option value="" disabled>What kind of group is this?</option>
            {SHARED_GROUP_KINDS.map((choice) => (
              <option key={choice.value} value={choice.value}>{choice.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button onClick={() => setConfirming(true)} disabled={!ready || busy} data-testid="button-convert-continue">Continue</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={(value) => { if (!value && !busy) setConfirming(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-turn-into-group"
              disabled={busy}
              onClick={(event) => { event.preventDefault(); void convert(); }}
            >
              {busy ? "Working…" : "Turn into a group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** In a Shared group its owner is alone in: make it their Personal budget (the swap). */
export function MakeGroupMyPersonalBudget({ groupId, groupName }: { groupId: number; groupName: string }) {
  const { data: status } = usePersonalBudgetStatus();
  const { toast } = useToast();
  const settle = useSettle();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmation = makePersonalConfirmation(groupName, status);

  const swap = async () => {
    setBusy(true);
    try {
      const result = await makeGroupPersonal(groupId);
      setConfirming(false);
      toast({
        title: "This is now your Personal budget",
        description: result.previousPersonal?.outcome === "kept-as-group"
          ? `Your old Personal budget is kept as the group "${result.previousPersonal.name}".`
          : "Everything in it is just as it was.",
      });
      await settle();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not make it your Personal budget",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-4" data-testid="make-group-personal">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Make this my Personal budget</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            You are the only one here. It keeps everything and becomes your private budget.
          </p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto sm:shrink-0" onClick={() => setConfirming(true)} data-testid="button-make-personal">
          <UserRound className="mr-2 h-4 w-4" /> Make it my Personal budget
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={(value) => { if (!value && !busy) setConfirming(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-make-personal"
              disabled={busy}
              onClick={(event) => { event.preventDefault(); void swap(); }}
            >
              {busy ? "Working…" : "Make it my Personal budget"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Shown only while the Personal budget is unused. Removing it while it is the
 * open budget goes Home, where the person picks another; from anywhere else
 * the open budget stays as it is.
 */
export function RemoveUnusedPersonalBudget() {
  const { data: status } = usePersonalBudgetStatus();
  const { data: openGroup } = useGetGroup();
  const openBudgetIsPersonal = openGroup?.isPrivate === true;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const settle = useSettle();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canRemovePersonalBudget(status)) return null;

  const remove = async () => {
    setBusy(true);
    try {
      await removeUnusedPersonalBudget();
      setConfirming(false);
      toast({ title: "Personal budget removed", description: "You can create a new one any time." });
      if (openBudgetIsPersonal) await settle();
      else await queryClient.invalidateQueries();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not remove it",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" data-testid="remove-unused-personal">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Remove my unused Personal budget</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Nothing has been recorded in it. You can create a new one any time.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto sm:shrink-0"
          onClick={() => setConfirming(true)}
          data-testid="button-remove-personal"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Remove
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={(value) => { if (!value && !busy) setConfirming(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{REMOVE_PERSONAL_CONFIRMATION.title}</AlertDialogTitle>
            <AlertDialogDescription>{REMOVE_PERSONAL_CONFIRMATION.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-remove-personal"
              disabled={busy}
              onClick={(event) => { event.preventDefault(); void remove(); }}
            >
              {busy ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
