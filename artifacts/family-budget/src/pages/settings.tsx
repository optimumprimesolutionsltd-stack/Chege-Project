import { useEffect, useState } from "react";
import {
  useGetMembers,
  useLeaveGroup,
  useRemoveMember,
  useUpdateMemberRole,
  useGetGroup,
  useUpdateGroup,
  getGetIncomeSourcesQueryKey,
  type IncomeSource,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { GroupInviteLinks } from "@/components/group-invite-links";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMembersQueryKey } from "@workspace/api-client-react";
import { Check, LogOut, Pencil, Trash2, UserPlus, Shield, Send, RotateCcw, X } from "lucide-react";

type GroupInvitation = {
  id: number;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
};
type InviteContact = { id: number; name: string; email: string; role: "admin" | "member" };

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Something went wrong.");
  return body as T;
}

export default function Settings() {
  const { user, saveDisplayName } = useAuth();
  const { data: members, isLoading } = useGetMembers();
  const removeMember = useRemoveMember();
  const leaveGroup = useLeaveGroup();
  const updateMemberRole = useUpdateMemberRole();
  const { data: group } = useGetGroup();
  const updateGroup = useUpdateGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "member">("member");
  const [saveInviteContact, setSaveInviteContact] = useState(true);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<number | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [editingSourceName, setEditingSourceName] = useState("");
  const [savingSourceId, setSavingSourceId] = useState<number | null>(null);
  const isPrivateWorkspace = group?.isPrivate ?? false;
  const canManageWorkspace = members?.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === "owner" || member.role === "admin"),
  ) ?? false;
  const canManageShared = (members?.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === "owner" || member.role === "admin"),
  ) ?? false) && !isPrivateWorkspace;
  const myMembership = members?.find((member) => member.userId === user?.id);
  const canLeaveGroup = Boolean(myMembership && myMembership.role !== "owner");
  useEffect(() => {
    if (group?.name) setGroupName(group.name);
  }, [group?.name]);
  useEffect(() => {
    setDisplayName([user?.firstName, user?.lastName].filter(Boolean).join(" "));
  }, [user?.firstName, user?.lastName]);

  const { data: invitations = [] } = useQuery<GroupInvitation[]>({
    queryKey: ["group-invitations"],
    queryFn: () => requestJson("/api/group-invitations"),
    enabled: canManageShared,
  });
  const { data: inviteContacts = [] } = useQuery<InviteContact[]>({
    queryKey: ["group-invitation-contacts"],
    queryFn: () => requestJson("/api/group-invitation-contacts"),
    enabled: canManageShared,
  });
  const { data: incomeSources = [], isLoading: incomeSourcesLoading } = useQuery<IncomeSource[]>({
    queryKey: ["income-sources", canManageShared ? "all" : user?.id],
    queryFn: () => canManageShared
      ? requestJson<IncomeSource[]>("/api/income-sources")
      : user?.id
        ? requestJson<IncomeSource[]>(`/api/income-sources?userId=${encodeURIComponent(user.id)}`)
        : Promise.resolve([]),
    enabled: Boolean(user?.id),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const handleSaveGroupName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupName.trim()) {
      toast({
        variant: "destructive",
        title: "Group name required",
        description: "Enter a group name before saving.",
      });
      return;
    }
    try {
      await updateGroup.mutateAsync({ data: { name: groupName.trim() } });
      toast({ title: "Group name updated" });
    } catch {
      toast({ variant: "destructive", title: "Could not update group name" });
    }
  };

  const handleSaveDisplayName = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Enter the name you would like people to see.",
      });
      return;
    }

    setSavingDisplayName(true);
    try {
      await saveDisplayName(name);
      await queryClient.invalidateQueries();
      toast({ title: "Name updated" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update your name",
        description: error instanceof Error ? error.message : "Use letters, spaces, apostrophes, or hyphens.",
      });
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: "Enter an email address before sending the invitation.",
      });
      return;
    }
    setSendingInvite(true);
    try {
      await requestJson("/api/group-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: newMemberRole,
          contactName: inviteName.trim() || undefined,
          saveContact: saveInviteContact && Boolean(inviteName.trim()),
        }),
      });
      toast({
        title: "Invitation sent",
        description: `${inviteEmail.trim()} can sign in and accept the invitation.`,
      });
      setInviteName("");
      setInviteEmail("");
      setNewMemberRole("member");
      queryClient.invalidateQueries({ queryKey: ["group-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["group-invitation-contacts"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not send invitation", description: error instanceof Error ? error.message : undefined });
    } finally {
      setSendingInvite(false);
    }
  };

  const inviteSavedContact = async (contact: InviteContact) => {
    setSendingInvite(true);
    try {
      await requestJson("/api/group-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contact.email, role: contact.role, contactName: contact.name, saveContact: false }),
      });
      toast({ title: `Invitation sent to ${contact.name}` });
      queryClient.invalidateQueries({ queryKey: ["group-invitations"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not send invitation", description: error instanceof Error ? error.message : undefined });
    } finally {
      setSendingInvite(false);
    }
  };

  const resendInvitation = async (invitation: GroupInvitation) => {
    try {
      await requestJson(`/api/group-invitations/${invitation.id}/resend`, { method: "POST" });
      toast({ title: "Invitation resent" });
      queryClient.invalidateQueries({ queryKey: ["group-invitations"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not resend invitation", description: error instanceof Error ? error.message : undefined });
    }
  };

  const cancelInvitation = async (invitation: GroupInvitation) => {
    try {
      await requestJson(`/api/group-invitations/${invitation.id}`, { method: "DELETE" });
      toast({ title: "Invitation cancelled" });
      queryClient.invalidateQueries({ queryKey: ["group-invitations"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not cancel invitation", description: error instanceof Error ? error.message : undefined });
    }
  };

  const handleRoleChange = async (userId: string, role: "admin" | "member") => {
    try {
      await updateMemberRole.mutateAsync({ userId, data: { role } });
      toast({ title: role === "admin" ? "Made admin" : "Made member" });
      queryClient.invalidateQueries({ queryKey: getGetMembersQueryKey() });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not change role",
        description: error instanceof Error ? error.message : "Only owners and admins can change member roles.",
      });
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this person from the group? They will lose access immediately. Shared expenses, goals, bank activity, and history will stay with the group.")) return;
    try {
      await removeMember.mutateAsync({ userId });
      toast({ title: "Member removed", description: "Shared records stay with the group." });
      queryClient.invalidateQueries({ queryKey: getGetMembersQueryKey() });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not remove this person",
        description: error instanceof Error ? error.message : "Only owners and admins can remove members.",
      });
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm("Leave this group? You will lose access immediately. Shared expenses, goals, bank activity, and history will stay with the group.")) return;
    try {
      await leaveGroup.mutateAsync();
      queryClient.clear();
      window.location.assign(`${import.meta.env.BASE_URL}?left=1`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not leave group",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const invalidateIncomeSources = () => {
    queryClient.invalidateQueries({ queryKey: ["income-sources"] });
    queryClient.invalidateQueries({ queryKey: getGetIncomeSourcesQueryKey() });
  };

  const handleAddSource = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newSourceName.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Source name required",
        description: "Enter a name before adding the income source.",
      });
      return;
    }
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Sign in again before adding an income source.",
      });
      return;
    }

    setAddingSource(true);
    try {
      await requestJson<IncomeSource>("/api/income-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name, isMain: false }),
      });
      setNewSourceName("");
      invalidateIncomeSources();
      toast({ title: "Income source added", description: `${name} is now available when recording an expense.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not add income source",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setAddingSource(false);
    }
  };

  const handleDeleteSource = async (source: IncomeSource) => {
    if (!confirm(`Remove "${source.name}"? Existing expenses will not be changed.`)) return;

    setDeletingSourceId(source.id);
    try {
      await requestJson(`/api/income-sources/${source.id}`, { method: "DELETE" });
      invalidateIncomeSources();
      toast({ title: "Income source removed" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not remove income source",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeletingSourceId(null);
    }
  };

  const handleStartEditSource = (source: IncomeSource) => {
    setEditingSourceId(source.id);
    setEditingSourceName(source.name);
  };

  const handleCancelEditSource = () => {
    setEditingSourceId(null);
    setEditingSourceName("");
  };

  const handleSaveSource = async (source: IncomeSource) => {
    const name = editingSourceName.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Source name required",
        description: "Enter a name before saving the income source.",
      });
      return;
    }

    setSavingSourceId(source.id);
    try {
      await requestJson<IncomeSource>(`/api/income-sources/${source.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          isMain: source.isMain,
          expectedMonthlyAmount: source.expectedMonthlyAmount,
        }),
      });
      handleCancelEditSource();
      invalidateIncomeSources();
      toast({ title: "Income source updated" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update income source",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingSourceId(null);
    }
  };

  const pendingEmails = new Set(invitations.filter((invitation) => invitation.status === "pending").map((invitation) => invitation.email));

  return (
    <div className="space-y-8 pb-12 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          {canManageShared
            ? "Manage who has access to this group budget."
            : isPrivateWorkspace
              ? "This is your Personal budget. Only you can see it."
            : "View your group and manage your own account details."}
        </p>
      </div>

      {/* Your account */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>Your Account</CardTitle>
          </div>
          <CardDescription>Your sign-in email is used to confirm invitations sent to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg bg-muted px-4 py-3 text-sm text-foreground">
            Signed in as <strong>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email}</strong>
          </p>
          <form onSubmit={handleSaveDisplayName} noValidate className="space-y-2">
            <label htmlFor="display-name" className="text-sm font-semibold text-foreground">Your name</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Chege"
                maxLength={40}
                autoComplete="name"
                aria-describedby="display-name-help"
                disabled={savingDisplayName}
              />
              <Button type="submit" disabled={savingDisplayName || !displayName.trim()} className="w-full sm:w-auto sm:shrink-0">
                {savingDisplayName ? "Saving…" : "Save"}
              </Button>
            </div>
            <p id="display-name-help" className="text-xs leading-relaxed text-muted-foreground">
              This is the name other members see in shared budgets and activity.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Income sources */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle>{canManageShared ? "Shared budget income sources" : "Your income sources"}</CardTitle>
          <CardDescription>
            {canManageShared
              ? "Admins and owners can edit or remove any member’s income source. Members can manage their own sources."
              : "Add the places your personal expenses are funded from. They will appear in the Paid from choices when you record an expense."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddSource} noValidate className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newSourceName}
              onChange={(event) => setNewSourceName(event.target.value)}
              placeholder="e.g. Salary or business"
              maxLength={80}
              className="h-11 bg-card"
              aria-label="New income source name"
            />
            <Button type="submit" disabled={addingSource} className="h-11 w-full sm:w-auto sm:shrink-0">
              {addingSource ? "Adding…" : "Add source"}
            </Button>
          </form>

          {incomeSourcesLoading ? (
            <div className="space-y-2 animate-pulse" aria-label="Loading income sources">
              <div className="h-11 rounded-lg bg-muted" />
              <div className="h-11 rounded-lg bg-muted" />
            </div>
          ) : incomeSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
              <p className="text-sm font-medium text-foreground">No income sources yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add one above so it is ready for your next expense.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {incomeSources.map((source) => {
                const sourceOwner = members?.find((member) => member.userId === source.userId)?.userName
                  ?? (source.userId === user?.id ? "You" : "Member");
                const isEditing = editingSourceId === source.id;
                const isSaving = savingSourceId === source.id;
                return (
                  <div key={source.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editingSourceName}
                        onChange={(event) => setEditingSourceName(event.target.value)}
                        maxLength={80}
                        aria-label={`Edit ${source.name}`}
                        disabled={isSaving}
                        className="h-9 bg-card"
                      />
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{source.name}</p>
                        {canManageShared && (
                          <p className="mt-0.5 text-xs text-muted-foreground">For {sourceOwner}</p>
                        )}
                      </div>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Save ${source.name}`}
                            onClick={() => void handleSaveSource(source)}
                            disabled={isSaving || !editingSourceName.trim()}
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Cancel editing ${source.name}`}
                            onClick={handleCancelEditSource}
                            disabled={isSaving}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${source.name}`}
                          onClick={() => handleStartEditSource(source)}
                          disabled={deletingSourceId === source.id}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove ${source.name}`}
                        onClick={() => handleDeleteSource(source)}
                        disabled={isEditing || deletingSourceId === source.id || isSaving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle>Budget name</CardTitle>
          <CardDescription>
            {isPrivateWorkspace
              ? "This is the name for your Personal budget."
              : "This is the name your Shared budget sees across Bajeti."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManageWorkspace ? (
            <form onSubmit={handleSaveGroupName} noValidate className="flex flex-col gap-2 sm:flex-row">
              <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="e.g. Mwangaza Chama" />
              <Button type="submit" disabled={updateGroup.isPending} className="w-full sm:w-auto">
                {updateGroup.isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          ) : (
            <p className="text-lg font-semibold text-foreground">{group?.name ?? "Your budget"}</p>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle>{isPrivateWorkspace ? "Personal budget" : "Group Members"}</CardTitle>
          </div>
          <CardDescription>
            {isPrivateWorkspace
              ? "Only you have access to this Personal budget. Shared budgets remain separate."
              : canManageShared
                ? "You can change any non-owner between Admin and Member or remove their access. The group owner is protected."
              : "The people listed here have access to this budget. Works for families, chamas, clubs, teams, and other shared groups."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-12 bg-muted rounded-lg" />
              <div className="h-12 bg-muted rounded-lg" />
            </div>
          ) : (
            <div className="space-y-2">
              {members?.map((m) => (
                <div key={m.userId} className="flex flex-col gap-3 rounded-xl bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{m.userName ?? "Unknown"}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{m.userId}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManageShared && m.role !== "owner" && m.userId !== user?.id ? (
                      <>
                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <span>Role</span>
                          <select
                            aria-label={`Change role for ${m.userName ?? "member"}`}
                            value={m.role}
                            onChange={(event) => handleRoleChange(m.userId, event.target.value as "admin" | "member")}
                            disabled={updateMemberRole.isPending || removeMember.isPending}
                            className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemove(m.userId)}
                          disabled={removeMember.isPending || updateMemberRole.isPending}
                          aria-label={`Remove ${m.userName ?? "member"} from group`}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Remove
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-1 rounded-full">
                        {m.userId === user?.id ? `You · ${m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Member"}` : m.role === "owner" ? "Owner · Protected" : m.role === "admin" ? "Admin" : "Member"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {members?.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">No one registered yet.</p>
              )}
            </div>
          )}

          {isPrivateWorkspace ? (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                <p className="text-sm font-semibold text-foreground">Your Personal budget</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Expenses, goals, bank activity, and reports here belong only to you. A Shared budget has its own separate budget and members.
              </p>
            </div>
          ) : !canManageShared && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">Your group role</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                You can view shared finances, log your own expenses, and contribute to existing goals or shared funds. An admin manages members and group setup.
              </p>
            </div>
          )}
          {canLeaveGroup && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Leave this group</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    You will lose access immediately. The group’s shared finances and history stay in place.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleLeaveGroup}
                  disabled={leaveGroup.isPending}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {leaveGroup.isPending ? "Leaving…" : "Leave group"}
                </Button>
              </div>
            </div>
          )}
          {myMembership?.role === "owner" && !isPrivateWorkspace && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Owners stay in the group so it always has someone responsible for access. Ownership transfer is not available yet.
            </p>
          )}

          {/* Invite member form */}
          {canManageShared && <GroupInviteLinks />}
          {canManageShared && (
            <form onSubmit={handleAdd} noValidate className="space-y-3 border-t border-border/50 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Invite someone by email</p>
                <p className="mt-1 text-xs text-muted-foreground">They will sign in with this email and accept the invitation before gaining access.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto_auto] md:items-end">
                <label className="grid gap-1.5 text-xs font-medium text-foreground">
                  Name <span className="font-normal text-muted-foreground">(optional)</span>
                  <Input
                    aria-label="Invitee name"
                    placeholder="For your saved shortcut"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="h-11 bg-card text-foreground"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-foreground">
                  Email address
                  <Input
                    aria-label="Invitee email address"
                    type="email"
                    placeholder="name@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-11 bg-card text-foreground"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-foreground">
                  Access
                  <select
                    aria-label="Invite role"
                    value={newMemberRole}
                    onChange={(event) => setNewMemberRole(event.target.value as "admin" | "member")}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <Button type="submit" disabled={sendingInvite} className="h-11 gap-2 px-5">
                  <Send className="h-4 w-4" />
                  {sendingInvite ? "Sending…" : "Invite"}
                </Button>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">There is no owner code to enter or share.</span>{" "}
                Owner is the group role for the person who created the group and keeps responsibility for its access. Invite someone as a{" "}
                <span className="font-semibold text-foreground">Member</span> to participate in shared finances, or an{" "}
                <span className="font-semibold text-foreground">Admin</span> to also manage members and group setup.
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={saveInviteContact}
                  onChange={(event) => setSaveInviteContact(event.target.checked)}
                  disabled={!inviteName.trim()}
                />
                Save this person as a one-tap invite contact
              </label>
            </form>
          )}
          {canManageShared && inviteContacts.length > 0 && (
            <div className="space-y-3 border-t border-border/50 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Quick invite</p>
                <p className="mt-1 text-xs text-muted-foreground">Saved people can be invited again without typing their details.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {inviteContacts.map((contact) => {
                  const pending = pendingEmails.has(contact.email);
                  return (
                    <div key={contact.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{contact.email} · {contact.role}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={sendingInvite || pending} onClick={() => inviteSavedContact(contact)}>
                        {pending ? "Pending" : "Invite"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {canManageShared && invitations.some((invitation) => invitation.status === "pending") && (
            <div className="space-y-3 border-t border-border/50 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Pending invitations</p>
                <p className="mt-1 text-xs text-muted-foreground">A person joins only after they sign in and accept.</p>
              </div>
              {invitations.filter((invitation) => invitation.status === "pending").map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Resend invitation to ${invitation.email}`} onClick={() => resendInvitation(invitation)}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Cancel invitation to ${invitation.email}`} onClick={() => cancelInvitation(invitation)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
