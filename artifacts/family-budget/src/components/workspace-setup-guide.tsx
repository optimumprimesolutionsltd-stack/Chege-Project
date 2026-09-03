import { useEffect, useState } from "react";
import {
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useGetJointAccounts,
  useGetMembers,
  useGetSavingsGoals,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { CheckCircle2, ChevronLeft, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFirstIncompleteSetupStep, getWorkspaceSetupSteps, getWorkspaceSetupStorageKey } from "@/lib/workspace-setup";

export function WorkspaceSetupGuide({ userId }: { userId?: string }) {
  const groupQuery = useGetGroup();
  const categoriesQuery = useGetBudgetCategories();
  const incomeQuery = useGetIncomeSources();
  const accountsQuery = useGetJointAccounts();
  const goalsQuery = useGetSavingsGoals();
  const membersQuery = useGetMembers();
  const group = groupQuery.data;
  const members = membersQuery.data ?? [];
  const isShared = group?.isPrivate === false;
  const isManager =
    group?.role === "owner" ||
    group?.role === "admin" ||
    members.some(
      (member) => member.userId === userId && (member.role === "owner" || member.role === "admin"),
    );
  const shouldShow = group?.isPrivate === true || (isShared && isManager);
  const workspaceId = group?.id;
  const storageKey = workspaceId ? getWorkspaceSetupStorageKey(workspaceId) : null;
  const [collapsed, setCollapsed] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      setCollapsed(localStorage.getItem(storageKey) === "true");
    } catch {
      setCollapsed(false);
    }
  }, [storageKey]);

  const steps = getWorkspaceSetupSteps({
    isShared,
    categories: categoriesQuery.data ?? [],
    incomeSources: incomeQuery.data ?? [],
    bankAccounts: accountsQuery.data ?? [],
    goals: goalsQuery.data ?? [],
    memberCount: members.length,
  });
  const nextStep = getFirstIncompleteSetupStep(steps);
  const nextStepIndex = steps.findIndex((step) => step.id === nextStep?.id);
  const completedCount = steps.filter((step) => step.complete).length;
  const loading = [groupQuery, categoriesQuery, incomeQuery, accountsQuery, goalsQuery, membersQuery]
    .some((query) => query.isLoading);
  const hasError = [groupQuery, categoriesQuery, incomeQuery, accountsQuery, goalsQuery, membersQuery]
    .some((query) => query.isError);

  useEffect(() => {
    if (nextStep) setReviewIndex(steps.findIndex((step) => step.id === nextStep.id));
  }, [nextStep?.id]);

  if (!shouldShow || !nextStep) return null;

  const setGuideCollapsed = (value: boolean) => {
    setCollapsed(value);
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(value)); } catch {}
    }
  };
  const retry = () => {
    void Promise.all([
      groupQuery.refetch(), categoriesQuery.refetch(), incomeQuery.refetch(),
      accountsQuery.refetch(), goalsQuery.refetch(), membersQuery.refetch(),
    ]);
  };
  const reviewedStep = steps[reviewIndex ?? nextStepIndex] ?? nextStep;
  const reviewingCompletedStep = reviewedStep.id !== nextStep.id && reviewedStep.complete;

  if (collapsed) {
    return (
      <Card className="border-primary/25 bg-primary/[0.04] shadow-sm">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Start here</p><p className="mt-1 text-sm text-muted-foreground">{completedCount} of {steps.length} setup steps complete</p></div>
          <Button type="button" variant="outline" onClick={() => setGuideCollapsed(false)} data-testid="button-open-workspace-setup">Start here</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.09] to-card shadow-md">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Start here</p><h2 className="mt-1 text-xl font-display font-bold">Set up this budget</h2><p className="mt-1 text-sm text-muted-foreground">{completedCount === 0 ? "Great start — a few details will make this budget useful." : completedCount === steps.length - 1 ? "One more step and this budget is ready." : "Almost there — keep building your budget foundation."}</p></div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setGuideCollapsed(true)} data-testid="button-skip-workspace-setup">Skip for now</Button>
        </div>
        {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-workspace-setup-loading"><Loader2 className="h-4 w-4 animate-spin" />Checking your setup progress…</p> : hasError ? <div className="mt-5 flex items-center gap-3 text-sm text-destructive" data-testid="status-workspace-setup-error">We couldn’t check every setup step.<Button type="button" size="sm" variant="outline" onClick={retry} data-testid="button-retry-workspace-setup"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry</Button></div> : <>
          <div className="mt-5 flex items-center justify-between text-sm"><span className="font-semibold">{completedCount} of {steps.length} complete</span><span className="text-muted-foreground">{Math.round((completedCount / steps.length) * 100)}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(completedCount / steps.length) * 100}%` }} /></div>
          <div className="mt-5 rounded-xl border bg-card/80 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
              {reviewingCompletedStep ? "Completed step" : `Step ${nextStepIndex + 1} of ${steps.length}`}
            </p>
            <p className="mt-1 text-sm font-semibold">{reviewedStep.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{reviewedStep.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(reviewIndex ?? nextStepIndex) > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setReviewIndex((index) => Math.max(0, (index ?? nextStepIndex) - 1))} data-testid="button-back-workspace-setup"><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>}
              {reviewingCompletedStep ? (
                <Button type="button" size="sm" onClick={() => setReviewIndex(nextStepIndex)}>Continue to next step</Button>
              ) : (
                <Link href={nextStep.route}><Button data-testid="link-workspace-setup-action">{nextStep.action}</Button></Link>
              )}
            </div>
          </div>
          <ol className="mt-4 grid gap-2 text-xs sm:grid-cols-2">{steps.map((step) => <li key={step.id} className={`flex items-center gap-2 ${step.complete ? "text-muted-foreground" : "font-semibold text-foreground"}`}><CheckCircle2 className={`h-4 w-4 ${step.complete ? "text-primary" : "text-muted-foreground"}`} />{step.title}</li>)}</ol>
        </>}
      </CardContent>
    </Card>
  );
}