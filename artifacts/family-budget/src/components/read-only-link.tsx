import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, KeyRound, MessageCircle, RotateCcw, ShieldCheck, Shuffle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { appPath } from "@/lib/base-path";
import { formatDate } from "@/lib/utils";

type ActiveViewLink = { active: true; createdAt: string; expiresAt: string; passphraseRequired: boolean };
type ViewLinkStatus = { active: false } | ActiveViewLink;

function joinUrl(token: string): string {
  return new URL(appPath(`/join/${token}`, import.meta.env.BASE_URL), window.location.origin).toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body?.error || "Something went wrong.");
  return body;
}

/**
 * Read-only sharing for a Shared budget.
 *
 * A member link lets someone record; this one lets them only look — the whole
 * chama can watch the balance without the treasurer paying for forty seats. The
 * link can carry a spoken passphrase: a few plain words to say at the meeting
 * rather than send in the same message as the link.
 */
export function ReadOnlyLink({ groupName }: { groupName?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useQuery<ViewLinkStatus>({
    queryKey: ["group-view-links"],
    queryFn: () => fetch("/api/group-view-links", { credentials: "include" }).then((r) => readJson<ViewLinkStatus>(r)),
    retry: false,
  });
  const active: ActiveViewLink | null = status && status.active ? status : null;

  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [created, setCreated] = useState<{ url: string; passphrase: string | null } | null>(null);

  // Offer a passphrase to say out loud rather than leave the choice to whoever
  // is in a hurry. Only fetched when the treasurer opts in, and only if they
  // have not already typed their own.
  useEffect(() => {
    if (!usePassphrase || passphrase) return;
    let cancelled = false;
    fetch("/api/group-view-links/suggested-passphrase", { credentials: "include" })
      .then((r) => readJson<{ passphrase: string }>(r))
      .then((body) => {
        if (!cancelled) setPassphrase(body.passphrase);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [usePassphrase, passphrase]);

  const shufflePassphrase = async () => {
    try {
      const body = await readJson<{ passphrase: string }>(
        await fetch("/api/group-view-links/suggested-passphrase", { credentials: "include" }),
      );
      setPassphrase(body.passphrase);
    } catch {
      /* keep the current one */
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const phrase = usePassphrase ? passphrase.trim() : "";
      if (usePassphrase && phrase.length < 4) {
        toast({ variant: "destructive", title: "Passphrase too short", description: "Use at least 4 characters, or turn the passphrase off." });
        return;
      }
      const body = await readJson<{ token: string; expiresAt: string; passphraseRequired: boolean }>(
        await fetch("/api/group-view-links", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(usePassphrase ? { passphrase: phrase } : {}),
        }),
      );
      const url = joinUrl(body.token);
      setCreated({ url, passphrase: usePassphrase ? phrase : null });
      await navigator.clipboard.writeText(url).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["group-view-links"] });
      toast({
        title: "Read-only link ready",
        description: "It lasts 30 days and replaces any earlier viewing link.",
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not create link", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      await readJson(await fetch("/api/group-view-links", { method: "DELETE", credentials: "include" }));
      setCreated(null);
      queryClient.invalidateQueries({ queryKey: ["group-view-links"] });
      toast({ title: "Read-only link revoked", description: "It can no longer let anyone in. People already viewing keep their access until you remove them." });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not revoke link", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setRevoking(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copied` });
    } catch {
      toast({ variant: "destructive", title: `Could not copy the ${what.toLowerCase()}`, description: "Select and copy it manually." });
    }
  };

  const shareOnWhatsApp = (url: string) => {
    const message = `See the finances for ${groupName || "our Shared budget"} on Jamvi (view only): ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3 border-t border-border/50 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Eye className="h-4 w-4 text-primary" />
            Read-only link
          </p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Anyone with this link can sign in and <strong className="text-foreground">see</strong> this budget — balances, contributions, reports — but cannot record anything. It is free for them and lasts 30 days.
          </p>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => void create()} disabled={creating}>
          {creating ? "Creating…" : active ? <><RotateCcw className="mr-2 h-4 w-4" />Reset link</> : <><Eye className="mr-2 h-4 w-4" />Create link</>}
        </Button>
      </div>

      {!created && (
        <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={usePassphrase}
            onChange={(event) => setUsePassphrase(event.target.checked)}
          />
          <span>
            <span className="font-medium text-foreground">Protect it with a passphrase.</span> A few plain words to read out at the meeting — say it aloud, don&rsquo;t send it in the same message as the link.
          </span>
        </label>
      )}

      {usePassphrase && !created && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-2">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              aria-label="View link passphrase"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="e.g. kikapu-jembe-taa-4820"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </div>
          <Button type="button" size="icon" variant="outline" aria-label="Suggest another passphrase" onClick={() => void shufflePassphrase()}>
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>
      )}

      {active && !created && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Active until {formatDate(active.expiresAt)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {active.passphraseRequired ? "Passphrase-protected. " : ""}
                For privacy, the link is only shown when you create or reset it. Reset it to make a fresh copy.
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label="Revoke read-only link" onClick={() => void revoke()} disabled={revoking}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {created && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-semibold text-foreground">Read-only link — copy it now</p>
              <div className="flex flex-wrap gap-2">
                <input aria-label="Read-only link" readOnly value={created.url} className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground" />
                <Button type="button" size="icon" variant="outline" aria-label="Copy read-only link" onClick={() => void copy(created.url, "Link")}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" className="bg-[#25D366] text-white hover:bg-[#1eb257]" onClick={() => shareOnWhatsApp(created.url)}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
              </div>
              {created.passphrase && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    Passphrase — share this separately
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-sm text-foreground">{created.passphrase}</code>
                    <Button type="button" size="icon" variant="outline" aria-label="Copy passphrase" onClick={() => void copy(created.passphrase!, "Passphrase")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Say it at the meeting or send it another way. Anyone opening the link will be asked for it.
                  </p>
                </div>
              )}
            </div>
            <Button type="button" size="icon" variant="ghost" className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label="Revoke read-only link" onClick={() => void revoke()} disabled={revoking}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
