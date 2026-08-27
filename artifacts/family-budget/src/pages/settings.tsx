import { useEffect, useRef, useState } from "react";
import {
  useGetMembers,
  useLeaveGroup,
  useRemoveMember,
  useUpdateMemberRole,
  useGetGroup,
  useUpdateGroup,
  useRequestPhotoUpload,
  useGetBudgetCategoryRecommendations,
  useApplyBudgetCategoryRecommendations,
  getGetGroupQueryKey,
  getGetWorkspacesQueryKey,
  getGetBudgetCategoriesQueryKey,
  getGetBudgetCategoryRecommendationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { GroupInviteLinks } from "@/components/group-invite-links";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMembersQueryKey } from "@workspace/api-client-react";
import { Award, BriefcaseBusiness, Camera, Heart, Home, LockKeyhole, LogOut, Moon, Palette, Pencil, Star, Sun, Trash2, UserPlus, Users, Shield, Send, RotateCcw, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { WORKSPACE_NAME_STYLES, workspaceNameClass } from "@/lib/workspace-identity";
import type { WorkspaceNameStyle } from "@workspace/api-client-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SHARED_GROUP_KINDS, groupKindPresentation, type SharedGroupKind } from "@/components/group-kind";
import { applyAppearance, readAppearance, saveAppearance, type Appearance } from "@/lib/appearance";

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
  "#011C4E", "#003383", "#087F8C", "#08B7B0", "#209E45", "#C98C00",
  "#0F766E", "#2563EB", "#7C3AED", "#DB2777", "#D97706", "#059669",
] as const;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_OPTIMIZE_THRESHOLD_BYTES = 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1600;

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Something went wrong.");
  return body as T;
}

async function optimizePhotoForUpload(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    throw new Error("Choose a JPG, PNG, or WebP image smaller than 15 MB.");
  }
  if (file.size <= PHOTO_OPTIMIZE_THRESHOLD_BYTES) return file;

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Could not prepare this photo. Choose a different image."));
      nextImage.src = sourceUrl;
    });
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!optimized || optimized.size >= file.size) return file;
    return new File([optimized], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function Settings() {
  const { user, saveDisplayName, saveProfilePhoto } = useAuth();
  const { data: members, isLoading } = useGetMembers();
  const removeMember = useRemoveMember();
  const leaveGroup = useLeaveGroup();
  const updateMemberRole = useUpdateMemberRole();
  const { data: group } = useGetGroup();
  const updateGroup = useUpdateGroup();
  const applyCategoryRecommendations = useApplyBudgetCategoryRecommendations();
  const requestPhotoUpload = useRequestPhotoUpload();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmails, setInviteEmails] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "member">("member");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSlogan, setGroupSlogan] = useState("");
  const [groupEmoji, setGroupEmoji] = useState("");
  const [groupNameStyle, setGroupNameStyle] = useState<WorkspaceNameStyle>("plain");
  const [groupIcon, setGroupIcon] = useState<(typeof SHARED_BUDGET_ICONS)[number]["value"]>("users");
  const [groupAccentColor, setGroupAccentColor] = useState<(typeof SHARED_BUDGET_ACCENTS)[number]>("#003383");
  const [groupKind, setGroupKind] = useState<SharedGroupKind>("other");
  const [displayName, setDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingBudgetName, setEditingBudgetName] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(() => readAppearance());
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
  const { data: categoryRecommendations, isLoading: isLoadingRecommendations, isError: hasRecommendationsError } = useGetBudgetCategoryRecommendations({
    query: { queryKey: getGetBudgetCategoryRecommendationsQueryKey(), enabled: !isPrivateWorkspace },
  });
  useEffect(() => {
    if (group?.name) setGroupName(group.name);
    if (group?.icon) setGroupIcon(group.icon as (typeof SHARED_BUDGET_ICONS)[number]["value"]);
    if (group?.accentColor) setGroupAccentColor(group.accentColor as (typeof SHARED_BUDGET_ACCENTS)[number]);
    setGroupSlogan(group?.slogan ?? "");
    setGroupEmoji(group?.emoji ?? "");
    setGroupNameStyle(group?.nameStyle ?? "plain");
    if (group?.kind && group.kind !== "personal") setGroupKind(group.kind);
  }, [group?.name, group?.icon, group?.accentColor, group?.slogan, group?.emoji, group?.nameStyle, group?.kind]);
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
        data: {
          name: groupName.trim(),
          emoji: groupEmoji.trim() || null,
          nameStyle: groupNameStyle,
          icon: groupIcon,
          accentColor: groupAccentColor,
          slogan: groupSlogan.trim() || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoryRecommendationsQueryKey() }),
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
        title: isPrivateWorkspace ? "Could not update Personal budget" : "Could not update Shared budget",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const saveGroupKind = async () => {
    if (!group) return;
    try {
      await updateGroup.mutateAsync({
        data: {
          name: groupName.trim() || group.name,
          emoji: groupEmoji.trim() || null,
          nameStyle: groupNameStyle,
          icon: groupIcon,
          accentColor: groupAccentColor,
          slogan: groupSlogan.trim() || null,
          kind: groupKind,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoryRecommendationsQueryKey() }),
      ]);
      toast({ title: "Group kind updated", description: "Existing categories were not changed. Review the missing recommendations below." });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update group type", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const applyMissingRecommendations = async () => {
    try {
      await applyCategoryRecommendations.mutateAsync({ data: { confirm: true } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoryRecommendationsQueryKey() }),
      ]);
      toast({ title: "Recommended categories added", description: "Existing categories were left unchanged." });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add recommendations", description: error instanceof Error ? error.message : "Please try again." });
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
    setGroupSlogan(group?.slogan ?? "");
    setGroupEmoji(group?.emoji ?? "");
    setGroupNameStyle(group?.nameStyle ?? "plain");
    setEditingBudgetName(false);
  };
  const startDisplayNameEdit = () => {
    setDisplayName([user?.firstName, user?.lastName].filter(Boolean).join(" "));
    setEditingDisplayName(true);
  };
  const startBudgetNameEdit = () => {
    setGroupName(group?.name ?? "");
    setGroupSlogan(group?.slogan ?? "");
    setGroupEmoji(group?.emoji ?? "");
    setGroupNameStyle(group?.nameStyle ?? "plain");
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
    const optimizedFile = await optimizePhotoForUpload(file);
    const upload = await requestPhotoUpload.mutateAsync({
      data: {
        contentType: optimizedFile.type as "image/jpeg" | "image/png" | "image/webp",
        size: optimizedFile.size,
      },
    });
    const response =
      upload.uploadMethod === "POST"
        ? await (() => {
            const body = new FormData();
            for (const [key, value] of Object.entries(upload.uploadFields ?? {})) {
              body.append(key, value);
            }
            body.append("file", optimizedFile);
            return fetch(upload.uploadUrl, { method: "POST", body });
          })()
        : await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": optimizedFile.type },
            body: optimizedFile,
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
        data: {
          name: groupName.trim() || group.name,
          emoji: groupEmoji.trim() || null,
          nameStyle: groupNameStyle,
          icon: groupIcon,
          accentColor: groupAccentColor,
          slogan: groupSlogan.trim() || null,
          photoPath,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetCategoryRecommendationsQueryKey() }),
      ]);
      toast({ title: isPrivateWorkspace ? "Personal budget photo updated" : "Group photo updated" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: isPrivateWorkspace ? "Could not update Personal budget photo" : "Could not update group photo",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingGroupPhoto(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const emails = [...new Set(inviteEmails.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (emails.length === 0) {
      toast({
        variant: "destructive",
        title: "Email addresses required",
        description: "Enter one or more email addresses before sending invitations.",
      });
      return;
    }
    setSendingInvite(true);
    try {
      const result = await requestJson<{ sent: GroupInvitation[]; failed: { email: string; error: string }[] }>(
        "/api/group-invitations/batch",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails,
          role: newMemberRole,
        }),
        },
      );
      if (result.sent.length === 0) {
        throw new Error(result.failed[0]?.error ?? "No invitations were sent.");
      }
      const failureNote = result.failed.length > 0
        ? ` ${result.failed.length} could not be sent: ${result.failed.map((item) => `${item.email} (${item.error})`).join(", ")}`
        : "";
      toast({
        title: result.sent.length === 1 ? "Invitation sent" : `${result.sent.length} invitations sent`,
        description: `${result.sent.map((item) => item.email).join(", ")} can sign in and accept.${failureNote}`,
      });
      setInviteEmails("");
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

  const chooseAppearance = (nextAppearance: Appearance) => {
    setAppearance(nextAppearance);
    applyAppearance(nextAppearance);
    saveAppearance(nextAppearance);
    toast({
      title: nextAppearance === "white" ? "White appearance selected" : "Jamvi night selected",
      description: "This preference is saved on this device.",
    });
  };

  return (
    <div className="w-full max-w-2xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          {canManageShared
            ? "Manage who has access to this Shared budget."
            : isPrivateWorkspace
              ? "This is your Personal budget. Only you can see it."
            : "View your group and manage your own account details."}
        </p>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>
            Choose how Jamvi looks on this device. Your current Jamvi night theme stays selected unless you choose White.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Application appearance">
            <button
              type="button"
              role="radio"
              aria-checked={appearance === "white"}
              onClick={() => chooseAppearance("white")}
              className={`flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                appearance === "white"
                  ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/15"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-amber-500 shadow-sm">
                <Sun className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">White</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">An optional bright, simple background for everyday budgeting.</span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={appearance === "midnight"}
              onClick={() => chooseAppearance("midnight")}
              className={`flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                appearance === "midnight"
                  ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/15"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-[#06183c] text-brand-gold shadow-sm">
                <Moon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Jamvi night <span className="font-normal text-muted-foreground">(current)</span></span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">The existing navy look with softer contrast.</span>
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

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
            <ProfileAvatar user={user} className="h-12 w-12" textClassName="text-sm" />
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
              {uploadingProfilePhoto ? "Preparing photo…" : "Choose profile photo"}
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
               ? "This is the name for your Personal budget."
              : "This is the name your Shared budget sees across Jamvi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          {canManageWorkspace && editingBudgetName ? (
            <form onSubmit={handleSaveGroupIdentity} noValidate className="space-y-3">
              <Input ref={budgetNameInputRef} value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="e.g. Mwangaza Chama" aria-label="Budget name" disabled={updateGroup.isPending} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Names can use any language, numbers, emoji, and special characters.
              </p>
              <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <div>
                  <label htmlFor="budget-emoji" className="text-sm font-semibold text-foreground">Emoji <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Input
                    id="budget-emoji"
                    value={groupEmoji}
                    onChange={(event) => setGroupEmoji(event.target.value)}
                    maxLength={16}
                    placeholder="e.g. 🌱"
                    aria-describedby="budget-emoji-help"
                    disabled={updateGroup.isPending}
                    className="mt-1 text-xl"
                  />
                  <p id="budget-emoji-help" className="mt-1 text-xs text-muted-foreground">A quick visual cue.</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Name style</p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {WORKSPACE_NAME_STYLES.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        aria-pressed={groupNameStyle === style.value}
                        onClick={() => setGroupNameStyle(style.value)}
                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                          groupNameStyle === style.value
                            ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/15"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className={`block text-sm ${workspaceNameClass(style.value)}`}>{style.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{style.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="budget-slogan" className="text-sm font-semibold text-foreground">Budget slogan <span className="font-normal text-muted-foreground">(optional)</span></label>
                <Input id="budget-slogan" value={groupSlogan} onChange={(event) => setGroupSlogan(event.target.value)} maxLength={120} placeholder="e.g. Saving together, one goal at a time" aria-describedby="budget-slogan-help" disabled={updateGroup.isPending} className="mt-1" />
                <p id="budget-slogan-help" className="mt-1 text-xs leading-relaxed text-muted-foreground">This short line appears with your budget photo and name.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={updateGroup.isPending || !groupName.trim()} className="w-full sm:w-auto">
                  {updateGroup.isPending ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={cancelBudgetNameEdit} disabled={updateGroup.isPending} className="w-full sm:w-auto">
                  Cancel
                </Button>
              </div>
            </form>
          ) : canManageWorkspace ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-lg text-foreground ${workspaceNameClass(group?.nameStyle)}`}>
                  {group?.emoji ? `${group.emoji} ` : ""}{group?.name ?? "Your budget"}
                </p>
                {group?.slogan ? <p className="mt-1 text-sm italic text-muted-foreground">{group.slogan}</p> : null}
                <p className="mt-1 text-sm text-muted-foreground">Choose Edit when you’re ready to rename this budget.</p>
              </div>
              <Button type="button" variant="outline" onClick={startBudgetNameEdit} className="w-full sm:w-auto sm:shrink-0">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className={`text-lg text-foreground ${workspaceNameClass(group?.nameStyle)}`}>
                {group?.emoji ? `${group.emoji} ` : ""}{group?.name ?? "Shared budget"}
              </p>
                {group?.slogan ? <p className="mt-1 text-sm italic text-muted-foreground">{group.slogan}</p> : null}
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">An owner or admin manages this Shared budget’s name. Your access and shared records stay the same.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-none shadow-md">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>{isPrivateWorkspace ? "Personal budget identity" : "Shared budget identity"}</CardTitle>
            <CardDescription>
              {isPrivateWorkspace
                ? "Give your Personal budget a distinct look so it is easy to recognise when you switch budgets."
                : "A photo, icon, and accent colour help members recognise this Shared budget when they switch budgets."}
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
                 <p className={`text-lg text-foreground ${workspaceNameClass(groupNameStyle)}`}>
                   {groupEmoji ? `${groupEmoji} ` : ""}{group?.name || "Shared budget"}
                 </p>
                 {group?.slogan ? <p className="text-sm italic text-muted-foreground">{group.slogan}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {isPrivateWorkspace
                      ? "This identity belongs only to your Personal budget."
                      : "This identity belongs to the group, not any one member."}
                  </p>
              </div>
            </div>

            {canManageWorkspace ? (
              <>
                  <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                      {group?.photoUrl ? (
                        <img src={group.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: groupAccentColor }}>
                          <Camera className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {isPrivateWorkspace ? "Personal budget photo" : "Shared budget photo"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Choose a JPG, PNG, or WebP image up to 15 MB. Jamvi shrinks large photos first for a faster upload.
                        </p>
                      </div>
                    </div>
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted sm:w-auto sm:shrink-0">
                      <Camera className="h-4 w-4" />
                      {uploadingGroupPhoto ? "Preparing photo…" : "Choose photo"}
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
                  {updateGroup.isPending
                    ? "Saving…"
                    : isPrivateWorkspace
                      ? "Save Personal budget identity"
                      : "Save Shared budget identity"}
                </Button>
              </>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                An owner or admin can update the Shared budget name, emoji, style, icon, and accent colour.
              </p>
            )}
          </CardContent>
      </Card>
       {!isPrivateWorkspace && (
         <Card className="border-none shadow-md">
           <CardHeader className="p-4 sm:p-6">
             <CardTitle>Shared budget kind</CardTitle>
             <CardDescription>
               This helps Jamvi suggest useful budget categories for your group.
             </CardDescription>
           </CardHeader>
           <CardContent className="space-y-5 px-4 pb-4 sm:px-6 sm:pb-6">
             {canManageShared ? (
               <>
                 <fieldset className="space-y-2">
                   <legend className="text-sm font-semibold text-foreground">What kind of group is this?</legend>
                   <div className="grid gap-2 sm:grid-cols-2">
                     {SHARED_GROUP_KINDS.map((option) => {
                       const selected = groupKind === option.value;
                       return (
                         <button
                           key={option.value}
                           type="button"
                           aria-pressed={selected}
                           onClick={() => setGroupKind(option.value)}
                           className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"}`}
                         >
                           <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                           <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                         </button>
                       );
                     })}
                   </div>
                 </fieldset>
                 <p className="rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                   Changing the kind does not alter any existing categories. It only changes the recommendations you can add.
                 </p>
                 <Button type="button" onClick={() => void saveGroupKind()} disabled={updateGroup.isPending || groupKind === group?.kind}>
                   {updateGroup.isPending ? "Saving…" : "Save group type"}
                 </Button>
               </>
             ) : (
               <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                 <p className="text-sm font-semibold text-foreground">{groupKindPresentation(group?.kind).label}</p>
                 <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{groupKindPresentation(group?.kind).description}</p>
                 <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                   An owner or admin can change this kind. Changing it does not alter existing categories.
                 </p>
               </div>
             )}

             <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
               <div>
                 <p className="text-sm font-semibold text-foreground">Recommended categories</p>
                 <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                   {isLoadingRecommendations
                     ? "Checking recommendations…"
                     : hasRecommendationsError
                       ? "Could not load category recommendations. Please try again."
                     : categoryRecommendations?.missing.length
                       ? `Missing recommendations for this ${groupKindPresentation(categoryRecommendations.kind).label.toLowerCase()} budget:`
                       : "All recommended categories for this budget are already present."}
                 </p>
               </div>
               {categoryRecommendations?.missing.length ? (
                 <>
                   <ul className="flex flex-wrap gap-2" aria-label="Missing recommended categories">
                     {categoryRecommendations.missing.map((recommendation) => (
                       <li key={recommendation.name} className="rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground">
                         {recommendation.name}
                       </li>
                     ))}
                   </ul>
                   {canManageShared ? (
                     <Button
                       type="button"
                       variant="outline"
                       onClick={() => void applyMissingRecommendations()}
                       disabled={applyCategoryRecommendations.isPending}
                     >
                       {applyCategoryRecommendations.isPending ? "Adding…" : `Add ${categoryRecommendations.missing.length} missing recommendation${categoryRecommendations.missing.length === 1 ? "" : "s"}`}
                     </Button>
                   ) : null}
                 </>
               ) : null}
             </div>
           </CardContent>
         </Card>
       )}

      {/* Members */}
      <Card className="border-none shadow-md">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle>{isPrivateWorkspace ? "Personal budget" : "Group Members"}</CardTitle>
          </div>
          <CardDescription>
            {isPrivateWorkspace
               ? "Only you have access to your Personal budget. Shared budgets remain separate."
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
                <p className="text-sm font-semibold text-foreground">Personal budget</p>
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
                <p className="text-sm font-medium text-foreground">Invite people by email</p>
                <p className="mt-1 text-xs text-muted-foreground">Paste multiple addresses separated by commas, spaces, or new lines. Each person must sign in with their invited email and accept.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_auto_auto] md:items-end">
                <label className="grid gap-1.5 text-xs font-medium text-foreground">
                  Email addresses
                  <textarea
                    aria-label="Invitee email addresses"
                    placeholder={"alex@example.com\nsam@example.com"}
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                    rows={3}
                    className="min-h-11 resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
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
              <p className="text-xs text-muted-foreground">
                Saved one-tap contacts can still be invited below; batch invites are email-only.
              </p>
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
