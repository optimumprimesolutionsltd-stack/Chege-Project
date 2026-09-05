import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/lib/utils";
import { Loader2, Check, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { statusLine, type MemberEntitlements } from "@/lib/subscription-status";

type PaymentStatus = {
  status: "pending" | "succeeded" | "failed" | "timed_out";
  amountKes?: number;
  receipt?: string | null;
  detail?: string | null;
};

const MONTHLY_KES = 100;
const ANNUAL_KES = 1_000;

export default function Subscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const { data: entitlements, isLoading } = useQuery<MemberEntitlements>({
    queryKey: ["member-entitlements"],
    queryFn: async () => {
      const response = await fetch("/api/subscription-plans/entitlements", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your subscription.");
      return (await response.json()).member;
    },
  });

  // An ignored prompt produces no callback at all, so the screen asks rather
  // than waiting to be told. Cleared on unmount so a member who navigates away
  // mid-payment does not leave a timer running.
  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setWaiting(false);
  };

  const pollUntilSettled = (id: number) => {
    let attempts = 0;
    pollRef.current = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/payments/${id}/status`, { credentials: "include" });
        if (!response.ok) return;
        const payment = await response.json() as PaymentStatus;

        if (payment.status === "succeeded") {
          stopPolling();
          setPaymentId(null);
          toast({
            title: "Payment received",
            description: payment.receipt ? `M-Pesa code ${payment.receipt}.` : undefined,
          });
          queryClient.invalidateQueries({ queryKey: ["member-entitlements"] });
          return;
        }
        if (payment.status === "failed" || payment.status === "timed_out") {
          stopPolling();
          toast({
            variant: "destructive",
            title: "Payment not completed",
            description: payment.detail ?? "Nothing was charged. You can try again.",
          });
          return;
        }
      } catch {
        // A failed poll says nothing about the payment, so it keeps asking.
      }

      // Two minutes, which is longer than Safaricom leaves the prompt open.
      // Giving up in the screen does not cancel anything: if it did complete,
      // the callback still lands and the next page load shows it.
      if (attempts >= 40) {
        stopPolling();
        toast({
          title: "Still waiting on M-Pesa",
          description: "If you completed the payment, it will appear here shortly.",
        });
      }
    }, 3_000);
  };

  const pay = async () => {
    setWaiting(true);
    try {
      const response = await fetch("/api/payments/stk-push", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingInterval: interval,
          phoneNumber,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setWaiting(false);
        toast({ variant: "destructive", title: "Could not start payment", description: body.error });
        return;
      }

      setPaymentId(body.paymentId);
      toast({
        title: "Check your phone",
        description: body.promoApplied
          ? `Enter your M-Pesa PIN to pay ${formatKes(body.amountKes)}. Your code was applied.`
          : body.message,
      });
      pollUntilSettled(body.paymentId);
    } catch {
      setWaiting(false);
      toast({
        variant: "destructive",
        title: "Could not start payment",
        description: "Check your connection and try again.",
      });
    }
  };

  const price = interval === "annual" ? ANNUAL_KES : MONTHLY_KES;
  const status = entitlements ? statusLine(entitlements) : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Subscription</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One price covers your own budget and every group you are part of.
        </p>
      </div>

      {isLoading ? (
        <Card className="border-none shadow-md">
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading your subscription…
          </CardContent>
        </Card>
      ) : status ? (
        <Card className={`border-none shadow-md ${entitlements?.fullAccess ? "" : "bg-warning/5"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg" data-testid="subscription-status">{status.heading}</CardTitle>
            <CardDescription className="leading-relaxed">{status.detail}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="border-none shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {entitlements?.status === "active" ? "Renew early" : "Subscribe"}
          </CardTitle>
          <CardDescription>
            {entitlements?.status === "active"
              ? "Paying now adds to the end of your current period. You lose no days."
              : "Pay with M-Pesa. Your phone will prompt you for your PIN."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Billing interval">
            {([
              ["monthly", "Monthly", MONTHLY_KES, "every month"],
              ["annual", "Annual", ANNUAL_KES, "2 months free"],
            ] as const).map(([value, label, amount, note]) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                data-testid={`interval-${value}`}
                onClick={() => setInterval(value)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  interval === value
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/40"
                }`}
              >
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="font-display text-xl font-bold tabular-nums text-foreground">
                  {formatKes(amount)}
                </span>
                <span className="text-xs text-muted-foreground">{note}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mpesa-phone" className="text-sm font-semibold text-foreground">
              M-Pesa number
            </label>
            <Input
              id="mpesa-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07XX XXX XXX"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="h-12 bg-card text-base"
              data-testid="mpesa-phone"
            />
            <p className="text-xs text-muted-foreground">
              This can be any Safaricom number — it does not have to be the one you signed up with.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="promo-code" className="text-sm font-semibold text-foreground">
              Promo code <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="promo-code"
              placeholder="Student or group code"
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
              className="h-12 bg-card text-base"
              data-testid="promo-code"
            />
          </div>

          <Button
            type="button"
            disabled={waiting || !phoneNumber.trim()}
            onClick={() => void pay()}
            className="h-12 w-full rounded-xl text-base"
            data-testid="pay-with-mpesa"
          >
            {waiting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {paymentId ? "Waiting for your PIN…" : "Sending prompt…"}
              </>
            ) : (
              <>
                <Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />
                Pay {formatKes(price)} with M-Pesa
              </>
            )}
          </Button>

          {paymentId && (
            <p className="text-center text-sm text-muted-foreground" data-testid="payment-waiting">
              Enter your M-Pesa PIN on your phone. This page updates on its own — you can leave it open.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What your subscription covers</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2.5">
            {[
              "Your personal budget, income and expenses",
              "Join or create any number of Shared budgets",
              "No limit on how many people share a budget",
              "Shared bank accounts, savings goals and contributions",
              "Full history, reports and exports",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Groups cost nothing. Everyone in a Shared budget pays for their own subscription, so a
            chama of fifty has no bill of its own.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
