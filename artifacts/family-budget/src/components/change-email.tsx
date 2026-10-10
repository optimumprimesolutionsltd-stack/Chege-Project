import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import type { AuthUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  confirmReady,
  EMAIL_CHANGE_INTRO,
  EMAIL_CHANGE_PASSWORD_NOTE,
  emailChangeCodeSent,
  emailChangedMessage,
  looksLikeEmail,
  MIN_PASSWORD_LENGTH,
} from "@/lib/email-change";
import { Mail } from "lucide-react";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong. Please try again.");
  return data as T;
}

/** "Change email" in Your Account: new address -> code from that inbox -> moved. */
export function ChangeEmail() {
  const { adoptSession } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = email.trim().toLowerCase();

  const close = () => {
    if (busy) return;
    setOpen(false);
    setStep("email");
    setCode("");
    setPassword("");
    setError(null);
  };

  const sendCode = async () => {
    if (!looksLikeEmail(address) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ needsPassword: boolean }>("/api/auth/change-email/request-code", { email: address });
      setNeedsPassword(result.needsPassword);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!confirmReady(code, password, needsPassword) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ user: AuthUser }>("/api/auth/change-email/confirm", {
        email: address,
        code: code.trim(),
        ...(needsPassword ? { password } : {}),
      });
      adoptSession(result.user);
      toast({ title: "Email changed", description: emailChangedMessage(address) });
      setBusy(false);
      close();
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your email.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Sign-in email</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Moving to a new email? Your account and everything in it can come with you.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full sm:w-auto sm:shrink-0" data-testid="button-change-email">
          <Mail className="mr-2 h-4 w-4" /> Change email
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change your sign-in email</AlertDialogTitle>
            <AlertDialogDescription>
              {step === "email" ? EMAIL_CHANGE_INTRO : emailChangeCodeSent(address)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {step === "email" ? (
            <form onSubmit={(event) => { event.preventDefault(); void sendCode(); }} noValidate>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="new.email@example.com"
                aria-label="New email"
                autoComplete="email"
                autoFocus
                data-testid="input-new-email"
              />
            </form>
          ) : (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void confirm(); }} noValidate>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="6-digit code"
                aria-label="Code from the new inbox"
                autoComplete="one-time-code"
                autoFocus
                data-testid="input-email-code"
              />
              {needsPassword ? (
                <div className="space-y-1.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">{EMAIL_CHANGE_PASSWORD_NOTE}</p>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
                    aria-label="New password"
                    autoComplete="new-password"
                    data-testid="input-email-password"
                  />
                </div>
              ) : null}
              <button type="button" className="text-xs font-medium text-primary" onClick={() => { setStep("email"); setCode(""); setError(null); }}>
                Use a different address or send a new code
              </button>
            </form>
          )}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            {step === "email" ? (
              <Button onClick={() => void sendCode()} disabled={busy || !looksLikeEmail(address)} data-testid="button-send-email-code">
                {busy ? "Sending…" : "Send code"}
              </Button>
            ) : (
              <Button onClick={() => void confirm()} disabled={busy || !confirmReady(code, password, needsPassword)} data-testid="button-confirm-email-change">
                {busy ? "Changing…" : "Change email"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
