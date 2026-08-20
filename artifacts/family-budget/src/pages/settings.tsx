import { useEffect, useState } from "react";
import {
  useGetMembers,
  useAddMember,
  useRemoveMember,
  useUpdateMemberRole,
  useGetGroup,
  useUpdateGroup,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMembersQueryKey } from "@workspace/api-client-react";
import { Trash2, UserPlus, Shield, Copy, Check } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { data: members, isLoading } = useGetMembers();
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const updateMemberRole = useUpdateMemberRole();
  const { data: group } = useGetGroup();
  const updateGroup = useUpdateGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newUserId, setNewUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "member">("member");
  const [groupName, setGroupName] = useState("");
  const [copied, setCopied] = useState(false);
  const canManageShared = members?.some(
    (member) =>
      member.userId === user?.id &&
      (member.role === "owner" || member.role === "admin"),
  ) ?? false;
  useEffect(() => {
    if (group?.name) setGroupName(group.name);
  }, [group?.name]);

  const handleSaveGroupName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupName.trim()) return;
    try {
      await updateGroup.mutateAsync({ data: { name: groupName.trim() } });
      toast({ title: "Group name updated" });
    } catch {
      toast({ variant: "destructive", title: "Could not update group name" });
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim()) return;
    try {
      await addMember.mutateAsync({ data: { userId: newUserId.trim(), role: newMemberRole } });
      toast({
        title: newMemberRole === "admin" ? "Admin added" : "Member added",
        description: "They can now sign in to the app.",
      });
      setNewUserId("");
      setNewMemberRole("member");
      queryClient.invalidateQueries({ queryKey: getGetMembersQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not add member. Check the User ID and try again." });
    }
  };

  const handleRoleChange = async (userId: string, role: "admin" | "member") => {
    try {
      await updateMemberRole.mutateAsync({ userId, data: { role } });
      toast({ title: role === "admin" ? "Made admin" : "Made member" });
      queryClient.invalidateQueries({ queryKey: getGetMembersQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Could not change role" });
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this person? They will lose access to the app.")) return;
    try {
      await removeMember.mutateAsync({ userId });
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: getGetMembersQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not remove partner." });
    }
  };

  const handleCopyId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 pb-12 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          {canManageShared
            ? "Manage who has access to this group budget."
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
          <CardDescription>Copy your ID and share it with anyone you want to give access to this group.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted rounded-lg px-4 py-3 font-mono text-sm text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
              {user?.id ?? "—"}
            </div>
            <Button variant="outline" size="icon" onClick={handleCopyId} className="shrink-0 h-11 w-11">
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Signed in as <strong>{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email}</strong>
          </p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle>Group name</CardTitle>
          <CardDescription>This is the name your group sees across Bajeti.</CardDescription>
        </CardHeader>
        <CardContent>
          {canManageShared ? (
            <form onSubmit={handleSaveGroupName} className="flex gap-2">
              <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="e.g. Mwangaza Chama" />
              <Button type="submit" disabled={!groupName.trim() || updateGroup.isPending}>
                {updateGroup.isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          ) : (
            <p className="text-lg font-semibold text-foreground">{group?.name ?? "Your group"}</p>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle>Group Members</CardTitle>
          </div>
          <CardDescription>
            The people listed here have access to this budget. Works for individuals, couples, or small families.
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
                <div key={m.userId} className="flex items-center justify-between bg-muted/50 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">{m.userName ?? "Unknown"}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{m.userId}</p>
                  </div>
                    <div className="flex items-center gap-2">
                      {canManageShared && m.role !== "owner" && m.userId !== user?.id && (
                        <select
                          aria-label={`Role for ${m.userName ?? "member"}`}
                          value={m.role}
                          onChange={(event) => handleRoleChange(m.userId, event.target.value as "admin" | "member")}
                          disabled={updateMemberRole.isPending}
                          className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-medium"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                      {m.userId !== user?.id && canManageShared && m.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                          onClick={() => handleRemove(m.userId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-1 rounded-full">
                        {m.userId === user?.id ? `You · ${m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Member"}` : m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Member"}
                      </span>
                    </div>
                </div>
              ))}
              {members?.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">No one registered yet.</p>
              )}
            </div>
          )}

          {!canManageShared && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">Your group role</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                You can view shared finances, log your own expenses, and contribute to existing goals or shared funds. An admin manages members and group setup.
              </p>
            </div>
          )}

          {/* Add member form */}
          {canManageShared && (members?.length ?? 0) < 5 && (
            <form onSubmit={handleAdd} className="space-y-3 pt-2 border-t border-border/50">
              <p className="text-sm font-medium text-foreground">Give someone access</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste their User ID here..."
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="font-mono text-sm h-11 bg-card"
                />
                <select
                  aria-label="Invite role"
                  value={newMemberRole}
                  onChange={(event) => setNewMemberRole(event.target.value as "admin" | "member")}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button type="submit" disabled={!newUserId.trim() || addMember.isPending} className="h-11 px-5 shrink-0">
                  {addMember.isPending ? "Adding…" : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ask the person to open Settings and copy their User ID, then paste it above.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
