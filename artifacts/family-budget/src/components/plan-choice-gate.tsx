import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Gift } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { daysUntil, type MemberEntitlements } from "@/lib/subscription-status";
import {
  planChoiceExempt,
  readPlanChoice,
  recordPlanChoice,
  shouldShowPlanChoice,
  type PlanChoice,
} from "@/lib/plan-choice";
import { usePrices } from "@/hooks/use-prices";
import { kesLabel } from "@/lib/pricing";

/**
 * Compulsory, once per account: Jamvi is paid, so somebody on the free trial
 * says whether they are carrying on with the trial or paying now before they
 * reach the app. Mirrors the mobile plan-choice screen. Both answers are one
 * click and neither takes anything away — the trial keeps running.
 */
export function PlanChoiceGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const prices = usePrices();
  const [location, navigate] = useLocation();
  const [chosen, setChosen] = useState<PlanChoice | null>(null);
  const { data: entitlements } = useQuery<MemberEntitlements>({
    queryKey: ["member-entitlements"],
    queryFn: async () => {
      const response = await fetch("/api/subscription-plans/entitlements", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your plan.");
      return (await response.json()).member as MemberEntitlements;
    },
    staleTime: 60_000,
    retry: false,
  });

  const stored = user?.id ? readPlanChoice(user.id, window.localStorage) : null;
  if (!user?.id || chosen || planChoiceExempt(location) || !shouldShowPlanChoice(entitlements, stored)) {
    return <>{children}</>;
  }

  const daysLeft = daysUntil(entitlements?.trialEndsAt ?? null);
  const choose = (choice: PlanChoice) => {
    recordPlanChoice(user.id, choice, window.localStorage);
    setChosen(choice);
    if (choice === "pay") navigate("/subscription");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-border/70 bg-card p-7 shadow-xl sm:p-10">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Gift className="h-6 w-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Before you start</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Jamvi is a paid app</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Try everything free{daysLeft !== null && daysLeft > 0 ? ` for ${daysLeft} days` : " for your first 14 days"}. After that it is
          {kesLabel(prices.monthly)} a month or {kesLabel(prices.annual)} a year — one subscription covers your Personal budget and every group you are in.
          Nothing is ever deleted if you stop; recording just goes read-only.
        </p>
        <div className="mt-7 space-y-3">
          <Button className="w-full" onClick={() => choose("trial")} data-testid="plan-choice-trial">
            Start my free trial
          </Button>
          <Button className="w-full" variant="outline" onClick={() => choose("pay")} data-testid="plan-choice-pay">
            Pay now with M-Pesa
          </Button>
        </div>
      </section>
    </main>
  );
}
