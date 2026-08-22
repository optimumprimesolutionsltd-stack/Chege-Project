import {
  useAcceptGroupInviteLink,
  useGetGroupInviteLinkPreview,
} from "@workspace/api-client-react";
import { CheckCircle2, Link2, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

export default function JoinGroupPage() {
  const [, params] = useRoute("/join/:token");
  const token = params?.token ?? "";
  const { isAuthenticated, user } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isLoading, error } = useGetGroupInviteLinkPreview(token, {
    query: {
      queryKey: ["group-invite-link-preview", token],
      enabled: Boolean(token),
      retry: false,
    },
  });
  const acceptInvite = useAcceptGroupInviteLink();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const joinPath = `${base}/join/${token}`;

  const signIn = () => {
    window.location.assign(`/api/login?returnTo=${encodeURIComponent(joinPath)}`);
  };

  const accept = async () => {
    setActionError(null);
    try {
      await acceptInvite.mutateAsync({ token });
      setAccepted(true);
    } catch (acceptError) {
      setActionError(acceptError instanceof Error ? acceptError.message : "Could not join this group.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-border/70 bg-card p-7 shadow-xl sm:p-10">
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-primary/20" />
            <div className="h-7 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-11 w-full rounded bg-muted" />
          </div>
        ) : error || !data ? (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Link2 className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">This join link is not available</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              This link may have expired or been revoked. Ask a group owner or admin to generate a new private link.
            </p>
          </>
        ) : accepted ? (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">You are in</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              You joined <strong className="text-foreground">{data.groupName}</strong>. The group is now selected in Jamvi.
            </p>
            <Button className="mt-7 w-full" onClick={() => window.location.assign(base || "/")}>Open Jamvi</Button>
          </>
        ) : (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UsersRound className="h-6 w-6" />
            </div>
             <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Shared budget invitation</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Join {data.groupName}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
               This private link adds you as a member of the Shared budget.
            </p>
            <div className="mt-6 rounded-xl border border-border/70 bg-muted/40 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {isAuthenticated
                    ? <>Signed in as <strong className="text-foreground">{user?.email ?? "your account"}</strong>. Join only if you know and trust this group.</>
                     : "Sign in to join. Your Personal budget stays private and separate from this Shared budget."}
                </p>
              </div>
            </div>
            {actionError ? <p className="mt-4 text-sm text-destructive">{actionError}</p> : null}
            {isAuthenticated ? (
              <Button className="mt-7 w-full" onClick={accept} disabled={acceptInvite.isPending}>
                 {acceptInvite.isPending ? "Joining…" : "Join Shared budget"}
              </Button>
            ) : (
              <Button className="mt-7 w-full" onClick={signIn}>Sign in to join</Button>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              This link expires {new Date(data.expiresAt).toLocaleDateString()}.
            </p>
          </>
        )}
      </section>
    </main>
  );
}