import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { CheckCircle2, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

type InvitationPreview = {
  groupName: string;
  role: "admin" | "member";
  expiresAt: string;
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Could not load invitation.");
  return body as T;
}

export default function InvitePage() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const { isAuthenticated, user } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["group-invitation", token],
    queryFn: () => requestJson<InvitationPreview>(`/api/group-invitations/accept/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
    retry: false,
  });

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const invitePath = `${base}/invite/${token}`;

  const signIn = () => {
    window.location.assign(`/api/login?returnTo=${encodeURIComponent(invitePath)}`);
  };

  const accept = async () => {
    setAccepting(true);
    setActionError(null);
    try {
      await requestJson(`/api/group-invitations/accept/${encodeURIComponent(token)}`, { method: "POST" });
      setAccepted(true);
    } catch (acceptError) {
      setActionError(acceptError instanceof Error ? acceptError.message : "Could not accept invitation.");
    } finally {
      setAccepting(false);
    }
  };

  const goToApp = () => {
    window.location.assign(base || "/");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-5 py-12 flex items-center justify-center">
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
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">This invitation is not available</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {error instanceof Error ? error.message : "Ask a group admin to send you a fresh invitation."}
            </p>
          </>
        ) : accepted ? (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">You are in</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              You joined <strong className="text-foreground">{data.groupName}</strong> as a {data.role}.
            </p>
            <Button className="mt-7 w-full" onClick={goToApp}>Open Bajeti</Button>
          </>
        ) : (
          <>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UsersRound className="h-6 w-6" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Bajeti group invitation</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Join {data.groupName}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              You have been invited to join this shared budget as a <strong className="text-foreground">{data.role}</strong>.
            </p>
            <div className="mt-6 rounded-xl border border-border/70 bg-muted/40 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {isAuthenticated
                    ? <>Signed in as <strong className="text-foreground">{user?.email ?? "your account"}</strong>. Accept only if this is the email that received the invitation.</>
                    : "Sign in using the email address that received this invitation, then accept it to join the group."}
                </p>
              </div>
            </div>
            {actionError ? <p className="mt-4 text-sm text-destructive">{actionError}</p> : null}
            {isAuthenticated ? (
              <Button className="mt-7 w-full" onClick={accept} disabled={accepting}>
                {accepting ? "Joining…" : "Accept invitation"}
              </Button>
            ) : (
              <Button className="mt-7 w-full" onClick={signIn}>Sign in to accept</Button>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              This invitation expires {new Date(data.expiresAt).toLocaleDateString()}.
            </p>
          </>
        )}
      </section>
    </main>
  );
}