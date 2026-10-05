/**
 * Handing a budget to another Jamvi account - somebody taking over a group,
 * or the same person moving to a different email.
 *
 * There is no single "hand over" action on the server, and there does not
 * need to be: every step already exists (make-shared, invite, accept,
 * transfer-ownership, leave). What was missing is the order. A Personal budget
 * refuses transfer-ownership outright, and nothing said that turning it into a
 * Shared group first is the way through.
 *
 * So progress is read off the budget as it is now - whether it is shared, who
 * is in it, who is invited, who owns it - rather than stored anywhere. Stopping
 * halfway loses nothing: an unanswered invitation leaves a Shared group you
 * still own, and that can be turned back into your Personal budget.
 *
 * The same rules and wording as the phone's lib/budgetHandover.ts.
 */

export type HandoverMember = { userId: string; userName?: string | null; role: string };
export type HandoverInvitation = { id: number; email: string; status: string };

export type HandoverStepId = "make-shared" | "invite" | "accept" | "make-owner" | "leave";
export type HandoverStepState = "done" | "current" | "todo";
export type HandoverStep = { id: HandoverStepId; title: string; detail: string; state: HandoverStepState };

export type HandoverInput = {
  isPrivate: boolean;
  userId: string | null | undefined;
  members: ReadonlyArray<HandoverMember>;
  invitations: ReadonlyArray<HandoverInvitation>;
};

export const HANDOVER_INTRO =
  "Moves this budget to another Jamvi account - someone taking over, or a different email of your own. Nothing recorded is lost, and you can stop at any step.";

/**
 * Who can be made the owner. A viewer joined on a read-only link to look,
 * not to run anything, so the guide never offers one.
 */
export function handoverCandidates({ userId, members }: HandoverInput): HandoverMember[] {
  return members.filter((m) => m.userId !== userId && (m.role === "member" || m.role === "admin"));
}

export function pendingHandoverInvitations({ invitations }: HandoverInput): HandoverInvitation[] {
  return invitations.filter((invitation) => invitation.status === "pending");
}

/**
 * True once somebody else owns it and the person using the guide is an admin -
 * which is what transfer-ownership leaves the outgoing owner as. A plain
 * member never ran the group, so never handed it over.
 */
export function hasHandedOver({ isPrivate, userId, members }: HandoverInput): boolean {
  if (isPrivate || !userId) return false;
  const me = members.find((m) => m.userId === userId);
  return Boolean(me?.role === "admin" && members.some((m) => m.userId !== userId && m.role === "owner"));
}

/** Who may follow the guide: the owner, or the one who has just handed over. */
export function mayUseHandover(input: HandoverInput): boolean {
  if (input.isPrivate) return true;
  const me = input.members.find((m) => m.userId === input.userId);
  return me?.role === "owner" || hasHandedOver(input);
}

export function handoverSteps(input: HandoverInput): HandoverStep[] {
  const shared = !input.isPrivate;
  const handedOver = hasHandedOver(input);
  const candidates = handoverCandidates(input);
  const pending = pendingHandoverInvitations(input);
  const accepted = shared && (handedOver || candidates.length > 0);
  const invited = shared && (accepted || pending.length > 0);

  const waitingFor = pending.map((invitation) => invitation.email).join(", ");
  const steps: Array<Omit<HandoverStep, "state"> & { done: boolean }> = [
    {
      id: "make-shared",
      title: "Turn it into a Shared group",
      detail: shared
        ? "Done. Everything recorded stayed where it was."
        : "Only a Shared group can have a new owner. Everything recorded stays where it is - the new owner will see all of it, past entries too.",
      done: shared,
    },
    {
      id: "invite",
      title: "Invite the new owner",
      detail: "Use the email they sign in to Jamvi with. If it is your own new email, sign up with it first.",
      done: invited,
    },
    {
      id: "accept",
      title: "They accept the invitation",
      detail: accepted
        ? "Done. They are in the group."
        : waitingFor
          ? `Waiting for ${waitingFor} to sign in to Jamvi and accept. Check again once they have.`
          : "They sign in with the invited email and accept.",
      done: accepted,
    },
    {
      id: "make-owner",
      title: "Make them the owner",
      detail: handedOver
        ? "Done. You are now an admin."
        : "You become an admin and keep full access. Only the new owner can give it back.",
      done: handedOver,
    },
    {
      id: "leave",
      title: "Leave the group (optional)",
      detail:
        "Stay as an admin, or leave so it is fully theirs. Once they are the only one in it, they can make it their own Personal budget from Settings.",
      done: false,
    },
  ];

  const current = steps.findIndex((step) => !step.done);
  return steps.map(({ done, ...step }, index) => ({
    ...step,
    state: done ? "done" : index === current ? "current" : "todo",
  }));
}

export function makeOwnerConfirmation(name: string): { title: string; message: string } {
  return {
    title: `Make ${name} the owner?`,
    message: `You will become an admin - you keep full access, just not the owner role. ${name} will be able to remove members, change the group's setup, and delete it. Only ${name} can give it back.`,
  };
}

export function leaveAfterHandoverConfirmation(groupName: string): { title: string; message: string } {
  return {
    title: `Leave "${groupName}"?`,
    message: `You will lose access straight away. Everything in "${groupName}" stays with the new owner.`,
  };
}
