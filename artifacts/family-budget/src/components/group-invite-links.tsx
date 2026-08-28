import {
  getGetGroupInviteLinksQueryKey,
  useCreateGroupInviteLink,
  useGetGroupInviteLinks,
  useRevokeGroupInviteLink,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, MessageCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { appPath } from "@/lib/base-path";

function joinUrl(token: string) {
  return new URL(appPath(`/join/${token}`, import.meta.env.BASE_URL), window.location.origin).toString();
}

export function GroupInviteLinks({ groupName }: { groupName?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: links = [] } = useGetGroupInviteLinks();
  const createLink = useCreateGroupInviteLink();
  const revokeLink = useRevokeGroupInviteLink();
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);
  const activeLink = links.find((link) => link.status === "active");
  const shareUrl = lastCreatedUrl;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Private link copied", description: "Share it only with people you want in this group." });
    } catch {
      toast({ variant: "destructive", title: "Could not copy link", description: "Select and copy the link manually." });
    }
  };

  const shareOnWhatsApp = (url: string) => {
    const message = `Join ${groupName || "my Jamvi Shared budget"} using this private invite link: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const create = async () => {
    try {
      const created = await createLink.mutateAsync();
      const url = joinUrl(created.token);
      setLastCreatedUrl(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: getGetGroupInviteLinksQueryKey() });
      toast({
        title: "Private link ready",
        description: "It expires in 7 days and replaces any earlier active link.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not create link",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const revoke = async () => {
    if (!activeLink) return;
    try {
      await revokeLink.mutateAsync({ id: activeLink.id });
      setLastCreatedUrl(null);
      queryClient.invalidateQueries({ queryKey: getGetGroupInviteLinksQueryKey() });
      toast({ title: "Private link revoked", description: "It can no longer add anyone to the group." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not revoke link",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <div className="space-y-3 border-t border-border/50 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link2 className="h-4 w-4 text-primary" />
            Private invite link
          </p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Anyone with the active link can sign in and join as a member until it expires. Generate a new link to reset access, or revoke it immediately.
          </p>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={create} disabled={createLink.isPending}>
          {createLink.isPending ? "Creating…" : activeLink ? <><RotateCcw className="mr-2 h-4 w-4" />Reset link</> : <><Link2 className="mr-2 h-4 w-4" />Create link</>}
        </Button>
      </div>

      {activeLink && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Active until {new Date(activeLink.expiresAt).toLocaleDateString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {shareUrl
                  ? "This link has been copied. You can copy it again below."
                  : "For privacy, the full link is only shown when you create or reset it. Reset it to make a fresh copy."}
              </p>
              {shareUrl && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input aria-label="Private invite link" readOnly value={shareUrl} className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground" />
                  <Button type="button" size="icon" variant="outline" aria-label="Copy private invite link" onClick={() => void copy(shareUrl)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                   <Button type="button" size="sm" className="bg-[#25D366] text-white hover:bg-[#20bd5a]" onClick={() => shareOnWhatsApp(shareUrl)}>
                     <MessageCircle className="mr-2 h-4 w-4" />
                     Share on WhatsApp
                   </Button>
                </div>
              )}
            </div>
            <Button type="button" size="icon" variant="ghost" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label="Revoke private invite link" onClick={revoke} disabled={revokeLink.isPending}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}