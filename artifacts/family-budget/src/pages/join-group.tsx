import {
  useAcceptGroupInviteLink,
  useGetGroupInviteLinkPreview,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, KeyRound, Link2, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { appPath } from "@/lib/base-path";

type ViewLinkPreview = {
  groupName: string;
  role: string;
  expiresAt: string;
  passphraseRequired: boolean;
};

export default function JoinGroupPage() {
  const [, params] = useRoute("/join/:token");
  const token = params?.token ?? "";
  const { isAuthenticated, user } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    data,
    isLoading,
    error,
  } = useGetGroupInviteLinkPreview(token, {
    query: {
      queryKey: ["group-invite-link-preview", token],
      enabled: Boolean(token),
      retry: false,
    },
  });
  const acceptInvite = useAcceptGroupInviteLink();
  const joinPath = appPath(`/join/${token}`, import.meta.env.BASE_URL);

  // A member link and a read-only link share the /join/:token shape but hit
  // different endpoints. Only look for a view link once the member preview has
  // failed, so a normal invite never makes an extra request.
  const viewPreview = useQuery<ViewLinkPreview>({
    queryKey: ["group-view-link-preview", token],
    enabled: Boolean(token) && Boolean(error),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/group-view-links/accept/${token}`, { credentials: "include" });
      const body = (await response.json().catch(() => ({}))) as ViewLinkPreview & { error?: string };
      if (!response.ok) throw new Error(body?.error || "This link is not available.");
      return body;
    },
  });
  const isViewLink = Boolean(error) && Boolean(viewPreview.data);

  const [passphrase, setPassphrase] = useState("");
  const [accepting, setAccepting] = useState(false);

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

  const acceptView = async () => {
    setActionError(null);
    setAccepting(true);
    try {
      const response = await fetch(`/api/group-view-links/accept/${token}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(viewPreview.data?.passphraseRequired ? { passphrase: passphrase.trim() } : {}),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body?.error || "Could not open this budget.");
      setAccepted(true);
    } catch (acceptError) {
      setActionError(acceptError instanceof Error ? acceptError.message : "Could not open this budget.");
    } finally {
      setAccepting(false);
    }
  };

  // After the member preview fails we wait on the view-link check before
  // deciding the link is dead — otherwise a valid view link flashes the
  // "not available" screen for a tick.
  const resolvingViewLink = Boolean(error) && !viewPreview.isError && !viewPreview.data;
  const linkUnavailable = Boolean(error) && viewPreview.isError;
  const groupName = isViewLink ? viewPreview.data?.groupName : data?.groupName;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-border/70 bg-card p-7 shadow-xl sm:p-10">
        {isLoading || resolvingViewLink ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-primary/20" />
            <div className="h-7 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-11 w-full rounded bg-muted" />
          </div>
        ) : linkUnavailable || (!data && !isViewLink) ? (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Link2 className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">This join link is not available</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              This link may have expired or been revoked. Ask a group owner or admin to generate a new one.
            </p>
          </>
        ) : accepted ? (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">{isViewLink ? "You can now view this budget" : "You are in"}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {isViewLink ? "You have viewing access to " : "You joined "}
              <strong className="text-foreground">{groupName}</strong>. It is now selected in Jamvi.
            </p>
            <Button className="mt-7 w-full" onClick={() => window.location.assign(appPath("/", import.meta.env.BASE_URL))}>Open Jamvi</Button>
          </>
        ) : isViewLink ? (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Eye className="h-6 w-6" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">View-only invitation</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-foreground">See {groupName}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              This link lets you <strong className="text-foreground">see</strong> the budget — balances, contributions, and reports — but not record anything. It is free.
            </p>
            <div className="mt-6 rounded-xl border border-border/70 bg-muted/40 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {isAuthenticated
                    ? <>Signed in as <strong className="text-foreground">{user?.email ?? "your account"}</strong>. Your own budget stays private and separate.</>
                    : "Sign in to view. Your own budget stays private and separate."}
                </p>
              </div>
            </div>
            {isAuthenticated && viewPreview.data?.passphraseRequired && (
              <label className="mt-5 block">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Passphrase
                </span>
                <input
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="The words you were given"
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  autoComplete="off"
                />
                <span className="mt-1 block text-xs text-muted-foreground">Ask whoever shared the link if you don&rsquo;t have it.</span>
              </label>
            )}
            {actionError ? <p className="mt-4 text-sm text-destructive">{actionError}</p> : null}
            {isAuthenticated ? (
              <Button
                className="mt-7 w-full"
                onClick={acceptView}
                disabled={accepting || (viewPreview.data?.passphraseRequired && passphrase.trim().length < 4)}
              >
                {accepting ? "Opening…" : "Open budget"}
              </Button>
            ) : (
              <Button className="mt-7 w-full" onClick={signIn}>Sign in to view</Button>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              This link expires {new Date(viewPreview.data!.expiresAt).toLocaleDateString()}.
            </p>
          </>
        ) : (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UsersRound className="h-6 w-6" />
            </div>
             <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Shared budget invitation</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Join {data!.groupName}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
               This private link adds you as a member of the Shared budget.
            </p>
            <div className="mt-6 rounded-xl border border-border/70 bg-muted/40 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {isAuthenticated
                    ? <>Signed in as <strong className="text-foreground">{user?.email ?? "your account"}</strong>. Join only if you know and trust this group.</>
                     : "Sign in to join. My budget stays private and separate from this Shared budget."}
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
              This link expires {new Date(data!.expiresAt).toLocaleDateString()}.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
