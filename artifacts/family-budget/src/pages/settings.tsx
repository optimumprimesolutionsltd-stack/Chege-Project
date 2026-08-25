import { useEffect, useRef, useState } from "react";
import {
  useGetMembers,
  useLeaveGroup,
  useRemoveMember,
  useUpdateMemberRole,
  useGetGroup,
  useUpdateGroup,
  useRequestPhotoUpload,
  getGetGroupQueryKey,
  getGetWorkspacesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { GroupInviteLinks } from "@/components/group-invite-links";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMembersQueryKey } from "@workspace/api-client-react";
import { Award, BriefcaseBusiness, Camera, Heart, Home, LockKeyhole, LogOut, Pencil, Star, Trash2, UserPlus, Users, Shield, Send, RotateCcw, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type GroupInvitation = {
  id: number;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
};
type InviteContact = { id: number; name: string; email: string; role: "admin" | "member" };
const SHARED_BUDGET_ICONS = [
  { value: "users", label: "People", icon: Users },
  { value: "home", label: "Home", icon: Home },
  { value: "heart", label: "Care", icon: Heart },
  { value: "briefcase", label: "Work", icon: BriefcaseBusiness },
  { value: "award", label: "Goals", icon: Award },
  { value: "star", label: "Star", icon: Star },
] as const;
const SHARED_BUDGET_ACCENTS = [
  "#0F766E", "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#059669",
] as const;

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Something went wrong.");
  return body as T;
}

export default function Settings() {
  const { user, saveDisplayName, saveProfilePhoto } = useAuth();
  const { data: members, isLoading } = useGetMembers();
  const removeMember = useRemoveMember();
  const leaveGroup = useLeaveGroup();
  const updateMemberRole = useUpdateMemberRole();
  const { data: group } = useGetGroup();
  const updateGroup = useUpdateGroup();
  const requestPhotoUpload = useRequestPhotoUpload();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "member">("member");
  const [saveInviteContact, setSaveInviteContact] = useState(true);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupIcon, setGroupIcon] = useState<(typeof SHARED_BUDGET_ICONS)[number]["value"]>("users");
  const [groupAccentColor, setGroupAccentColor] = useState<(typeof SHARED_BUDGET_ACCENTS)[number]>("#0F766E");
  const [displayName, setDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingBudgetName, setEditingBudgetName] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [uploadingGroupPhoto, setUploadingGroupPhoto] = useState(false);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const budgetNameInputRef = useRef<HTMLInputElement>(null);
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
    if (group?.icon) setGroupIcon(group.icon as (typeof SHARED_BUDGET_ICONS)[number]["value"]);
    if (group?.accentColor) setGroupAccentColor(group.accentColor as (typeof SHARED_BUDGET_ACCENTS)[number]);
  }, [group?.name, group?.icon, group?.accentColor]);
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

  const saveGroupIdentity = async (closeBudgetNameEditor = false) => {
    if (!groupName.trim()) {
      toast({
        variant: "destructive",
        title: "Group name required",
        description: "Enter a group name before saving.",
      });
      return;
    }
    try {
      await updateGroup.mutateAsync({
        data: { name: groupName.trim(), icon: groupIcon, accentColor: groupAccentColor },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
      ]);
      toast({
        title: isPrivateWorkspace ? "Budget updated" : "Shared budget updated",
        description: isPrivateWorkspace
          ? "Your budget name now appears across Jamvi."
          : "Its name and identity now appear across Jamvi.",
      });
      if (closeBudgetNameEditor) setEditingBudgetName(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update Shared budget",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleSaveGroupIdentity = (event: React.FormEvent) => {
    event.preventDefault();
    void saveGroupIdentity(true);
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
      setEditingDisplayName(false);
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

  const savedDisplayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const cancelDisplayNameEdit = () => {
    setDisplayName([user?.firstName, user?.lastName].filter(Boolean).join(" "));
    setEditingDisplayName(false);
  };
  const cancelBudgetNameEdit = () => {
    setGroupName(group?.name ?? "");
    setEditingBudgetName(false);
  };
  const startDisplayNameEdit = () => {
    setDisplayName([user?.firstName, user?.lastName].filter(Boolean).join(" "));
    setEditingDisplayName(true);
  };
  const startBudgetNameEdit = () => {
    setGroupName(group?.name ?? "");
    setEditingBudgetName(true);
  };

  useEffect(() => {
    if (!editingDisplayName) return;
    const frame = requestAnimationFrame(() => displayNameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editingDisplayName]);
  useEffect(() => {
    if (!editingBudgetName) return;
    const frame = requestAnimationFrame(() => budgetNameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editingBudgetName]);

  const uploadPhotoFile = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error("Choose a JPG, PNG, or WebP image smaller than 5 MB.");
    }
    const upload = await requestPhotoUpload.mutateAsync({
      data: { contentType: file.type as "image/jpeg" | "image/png" | "image/webp", size: file.size },
    });
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Could not upload your photo. Please try again.");
    return upload.objectPath;
  };

  const handleProfilePhotoChange = async (file?: File) => {
    if (!file) return;
    setUploadingProfilePhoto(true);
    try {
      await saveProfilePhoto(await uploadPhotoFile(file));
      toast({ title: "Profile photo updated" });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update profile photo", description: error instanceof Error ? error.message : undefined });
    } finally {
      setUploadingProfilePhoto(false);
    }
  };

  const handleGroupPhotoChange = async (file?: File) => {
    if (!file || !group) return;
    setUploadingGroupPhoto(true);
    try {
      const photoPath = await uploadPhotoFile(file);
      await updateGroup.mutateAsync({
        data: { name: groupName.trim() || group.name, icon: groupIcon, accentColor: groupAccentColor, photoPath },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
      ]);
      toast({ title: "Group photo updated" });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update group photo", description: error instanceof Error ? error.message : undefined });
    } finally {
      setUploadingGroupPhoto(false);
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

  const pendingEmails = new Set(invitations.filter((invitation) => invitation.status === "pending").map((invitation) => invitation.email));

  return (
    <div className="w-full max-w-2xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          {canManageShared
            ? "Manage who has access to this group budget."
            : isPrivateWorkspace
              ? "This is My budget. Only you can see it."
            : "View your group and manage your own account details."}
        </p>
      </div>

      {/* Your account */}
      <Card className="border-none shadow-md">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>Your Account</CardTitle>
          </div>
          <CardDescription>Your sign-in email is used to confirm invitations sent to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {([user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed in as</p>
              <p className="truncate text-sm font-semibold text-foreground">{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Your Jamvi account"}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{user?.email ?? "No sign-in email available"}</span>
              </div>
            </div>
          </div>
          <p className="rounded-lg bg-muted/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Your sign-in email is managed by your sign-in account and can’t be changed in Jamvi.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <Camera className="h-4 w-4" />
              {uploadingProfilePhoto ? "Uploading…" : "Choose profile photo"}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingProfilePhoto}
                onChange={(event) => void handleProfilePhotoChange(event.target.files?.[0])}
              />
            </label>
            {user?.profileImageUrl ? (
              <Button variant="ghost" size="sm" disabled={uploadingProfilePhoto} onClick={() => void saveProfilePhoto(null)}>
                Use sign-in photo
              </Button>
            ) : null}
          </div>
          {editingDisplayName ? (
            <form onSubmit={handleSaveDisplayName} noValidate className="space-y-2">
              <label htmlFor="display-name" className="text-sm font-semibold text-foreground">Your name</label>
              <Input
                ref={displayNameInputRef}
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Chege"
                maxLength={40}
                autoComplete="name"
                aria-describedby="display-name-help"
                disabled={savingDisplayName}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={savingDisplayName || !displayName.trim()} className="w-full sm:w-auto sm:shrink-0">
                  {savingDisplayName ? "Saving…" : "Save name"}
                </Button>
                <Button type="button" variant="outline" onClick={cancelDisplayNameEdit} disabled={savingDisplayName} className="w-full sm:w-auto">
                  Cancel
                </Button>
              </div>
              <p id="display-name-help" className="text-xs leading-relaxed text-muted-foreground">
                This is the name other members see in shared budgets and activity.
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Your name</p>
                <p className="mt-1 text-sm text-muted-foreground">{savedDisplayName || "Not set"}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">This is the name other members see in shared budgets and activity.</p>
              </div>
              <Button type="button" variant="outline" onClick={startDisplayNameEdit} className="w-full sm:w-auto sm:shrink-0">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Budget name</CardTitle>
          <CardDescription>
            {isPrivateWorkspace
               ? "This is the name for My budget."
              : "This is the name your Shared budget sees across Jamvi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          {canManageWorkspace && editingBudgetName ? (
            <form onSubmit={handleSaveGroupIdentity} noValidate className="flex flex-col gap-2 sm:flex-row">
              <Input ref={budgetNameInputRef} value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="e.g. Mwangaza Chama" aria-label="Budget name" disabled={updateGroup.isPending} />
              <Button type="submit" disabled={updateGroup.isPending || !groupName.trim()} className="w-full sm:w-auto">
                {updateGroup.isPending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelBudgetNameEdit} disabled={updateGroup.isPending} className="w-full sm:w-auto">
                Cancel
              </Button>
            </form>
          ) : canManageWorkspace ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">{group?.name ?? "Your budget"}</p>
                <p className="mt-1 text-sm text-muted-foreground">Choose Edit when you’re ready to rename this budget.</p>
              </div>
              <Button type="button" variant="outline" onClick={startBudgetNameEdit} className="w-full sm:w-auto sm:shrink-0">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-lg font-semibold text-foreground">{group?.name ?? "Shared budget"}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">An owner or admin manages this Shared budget’s name. Your access and shared records stay the same.</p>
            </div>
          )}
        </CardContent>
      </Card>
      {!isPrivateWorkspace && (
        <Card className="border-none shadow-md">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Shared budget identity</CardTitle>
            <CardDescription>
              A simple icon and accent color help members recognise this Shared budget when they switch between budgets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-3">
              {(() => {
                const Icon = SHARED_BUDGET_ICONS.find((option) => option.value === groupIcon)?.icon ?? Users;
                return group?.photoUrl ? (
                  <img src={group.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: groupAccentColor }}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                );
              })()}
              <div>
                 <p className="font-semibold text-foreground">{group?.name || "Shared budget"}</p>
                <p className="text-xs text-muted-foreground">This identity belongs to the group, not any one member.</p>
              </div>
            </div>

            {canManageShared ? (
              <>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background p-3">
                    {group?.photoUrl ? (
                      <img src={group.photoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl text-white" style={{ backgroundColor: groupAccentColor }}>
                        <Camera className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Group photo</p>
                      <p className="text-xs text-muted-foreground">Choose a square JPG, PNG, or WebP image up to 5 MB.</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                      <Camera className="h-4 w-4" />
                      {uploadingGroupPhoto ? "Uploading…" : "Choose photo"}
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingGroupPhoto}
                        onChange={(event) => void handleGroupPhotoChange(event.target.files?.[0])}
                      />
                    </label>
                  </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Icon</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {SHARED_BUDGET_ICONS.map((option) => {
                      const Icon = option.icon;
                      const selected = groupIcon === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setGroupIcon(option.value)}
                          aria-pressed={selected}
                          className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-medium transition-colors ${
                            selected ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Accent color</p>
                  <div className="flex flex-wrap gap-2">
                    {SHARED_BUDGET_ACCENTS.map((accent) => (
                      <button
                        key={accent}
                        type="button"
                        aria-label={`Use ${accent} as the accent color`}
                        aria-pressed={groupAccentColor === accent}
                        onClick={() => setGroupAccentColor(accent)}
                        className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 ${
                          groupAccentColor === accent ? "border-foreground ring-2 ring-offset-2 ring-ring" : "border-transparent"
                        }`}
                        style={{ backgroundColor: accent }}
                      />
                    ))}
                  </div>
                </div>
                <Button type="button" onClick={() => void saveGroupIdentity()} disabled={updateGroup.isPending}>
                  {updateGroup.isPending ? "Saving…" : "Save Shared budget identity"}
                </Button>
              </>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                An owner or admin can update the Shared budget name, icon, and accent color.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card className="border-none shadow-md">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle>{isPrivateWorkspace ? "My budget" : "Group Members"}</CardTitle>
          </div>
          <CardDescription>
            {isPrivateWorkspace
               ? "Only you have access to My budget. Shared budgets remain separate."
              : canManageShared
                ? "You can change any non-owner between Admin and Member or remove their access. The group owner is protected."
              : "The people listed here have access to this budget. Works for families, chamas, clubs, teams, and other shared groups."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-4 pb-4 sm:px-6 sm:pb-6">
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
                <p className="text-sm font-semibold text-foreground">My budget</p>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Leave this group</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    You will lose access immediately. The group’s shared finances and history stay in place.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto sm:shrink-0"
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
          {canManageShared && <GroupInviteLinks groupName={group?.name} />}
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
                <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 sm:shrink-0">
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
