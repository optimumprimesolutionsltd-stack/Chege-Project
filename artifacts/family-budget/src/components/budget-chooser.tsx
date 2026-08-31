import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspacesQueryKey,
  useCreateSharedGroup,
  useGetWorkspaces,
  useSelectWorkspace,
  type GroupKind,
  type Workspace,
} from "@workspace/api-client-react";
import { ArrowUpRight, Award, BriefcaseBusiness, Check, ChevronRight, Heart, Home, Plus, Star, Users, UsersRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupKindPresentation, SHARED_GROUP_KINDS, type SharedGroupKind } from "@/components/group-kind";
import { workspaceLabel, workspaceNameClass } from "@/lib/workspace-identity";
import { Input } from "@/components/ui/input";

const CHOOSER_STORAGE_PREFIX = "jamvi:budget-chooser:completed:";

const ONBOARDING_CATEGORY_TIERS: { priority: number; label: string; description: string; categories: readonly string[] }[] = [
  { priority: 1, label: "Essentials", description: "The costs that keep life moving.", categories: ["Food", "Food & meals", "Groceries", "Housing", "Accommodation", "Rent", "Utilities", "Shared bills", "Transport"] },
  { priority: 2, label: "Important", description: "Regular needs worth planning for.", categories: ["Health", "Education", "Tuition & fees", "Books & supplies", "Family support", "Personal care", "Insurance", "School fees"] },
  { priority: 3, label: "Household & connection", description: "The things that support your day-to-day life.", categories: ["Airtime & data", "Household", "Subscriptions", "Work & business", "Business supplies", "Stock & inventory"] },
  { priority: 4, label: "Flexible", description: "Optional spending and future plans.", categories: ["Entertainment", "Dates & activities", "Events", "Equipment", "Venue", "Clothing", "Gifts", "Member welfare", "Member contributions", "Projects", "Loans", "Other"] },
];

const ALL_ONBOARDING_CATEGORIES = ONBOARDING_CATEGORY_TIERS.flatMap((tier) => tier.categories);
const COMMON_INCOME_STREAMS = ["Salary or wages", "Business or side hustle", "Freelance or contract work", "Farming or livestock", "Rental income", "Family support or remittances", "Pension or benefits", "Other income"] as const;
const PURPOSE_CATEGORY_MAP: Record<string, readonly string[]> = {
  student: ["Food & meals", "Accommodation", "Transport", "Tuition & fees", "Books & supplies", "Airtime & data", "Personal care", "Entertainment", "Other"],
  working: ["Food", "Rent", "Utilities", "Transport", "Health", "Insurance", "Personal care", "Other"],
  business: ["Food", "Transport", "Health", "Work & business", "Business supplies", "Stock & inventory", "Airtime & data", "Other"],
  couple: ["Food & meals", "Rent", "Shared bills", "Utilities", "Transport", "Health", "Dates & activities", "Other"],
  friends: ["Food & meals", "Rent", "Shared bills", "Utilities", "Transport", "Entertainment", "Dates & activities", "Airtime & data", "Other"],
  family: ["Groceries", "Rent", "Utilities", "Transport", "Health", "School fees", "Family support", "Insurance", "Household"],
  chama: ["Member welfare", "Loans", "Member contributions", "Events", "Transport", "Projects", "Other"],
  club: ["Member contributions", "Events", "Equipment", "Venue", "Transport", "Projects", "Entertainment", "Other"],
};

export function budgetChooserCompletionKey(userId: string) {
  return `${CHOOSER_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function hasCompletedBudgetChooser(userId: string): boolean {
  try {
    return window.localStorage.getItem(budgetChooserCompletionKey(userId)) === "true";
  } catch {
    // Privacy settings and unavailable storage must never accidentally skip setup.
    return false;
  }
}

function markBudgetChooserComplete(userId: string) {
  try {
    window.localStorage.setItem(budgetChooserCompletionKey(userId), "true");
  } catch {
    // On the next visit the chooser is deliberately shown again.
  }
}

function WorkspaceIdentity({
  workspace,
  personalPhotoUrl,
}: {
  workspace: Workspace;
  personalPhotoUrl?: string | null;
}) {
  const Icon = ({
    users: Users,
    home: Home,
    heart: Heart,
    briefcase: BriefcaseBusiness,
    award: Award,
    star: Star,
  }[workspace.icon] ?? Users);
  const accent = workspace.accentColor ?? "#003383";

  const photoUrl = workspace.isPrivate ? personalPhotoUrl : workspace.photoUrl;
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="h-12 w-12 rounded-xl border-2 object-cover" style={{ borderColor: accent }} />;
  }
  if (workspace.emoji) {
    return <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl border text-2xl" style={{ backgroundColor: `${accent}24`, borderColor: `${accent}66` }}>{workspace.emoji}</span>;
  }
  return <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><Icon className="h-5 w-5" /></span>;
}

export function BudgetChooser({
  user,
}: {
  user: { id?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null; profileImageUrl?: string | null };
}) {
  const { data: workspaces = [], isLoading, isError: workspaceLoadFailed, refetch: refetchWorkspaces } = useGetWorkspaces();
  const selectWorkspace = useSelectWorkspace();
  const createSharedGroup = useCreateSharedGroup();
  const queryClient = useQueryClient();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [duplicateCategoryNotice, setDuplicateCategoryNotice] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const userId = user.id ?? "";
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [sharedBudgetName, setSharedBudgetName] = useState("");
  const [sharedBudgetKind, setSharedBudgetKind] = useState<SharedGroupKind | null>(null);
  const [onboardingMode, setOnboardingMode] = useState<"personal" | "shared" | "both" | null>(null);
  const [showPurposeSetup, setShowPurposeSetup] = useState(false);
  const [onboardingPurpose, setOnboardingPurpose] = useState<string | null>(null);
  const [showDurationSetup, setShowDurationSetup] = useState(false);
  const [budgetDuration, setBudgetDuration] = useState<"ongoing" | "week" | "month" | "quarter" | "custom" | null>(null);
  const [customEndDate, setCustomEndDate] = useState("");
  const [showCategorySetup, setShowCategorySetup] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryBudgetSetup, setShowCategoryBudgetSetup] = useState(false);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState("");
  const [showIncomeSetup, setShowIncomeSetup] = useState(false);
  const [selectedIncomeStreams, setSelectedIncomeStreams] = useState<string[]>([]);
  const [customIncomeStream, setCustomIncomeStream] = useState("");

  const enterApp = () => {
    if (userId) markBudgetChooserComplete(userId);
    queryClient.clear();
    window.location.reload();
  };

  const applyOnboardingPreferences = async (workspace: Workspace) => {
    if (!userId) return;
    // Category management belongs to the workspace manager. Income streams are
    // attributed to the signed-in user and can be added by any member.
    if (selectedCategories.length > 0 && (workspace.isPrivate || workspace.role === "owner" || workspace.role === "admin")) {
      const startDate = new Date().toISOString().slice(0, 10);
      const response = await fetch("/api/budget-plans/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: onboardingPurpose ? `${onboardingPurpose} budget` : "My budget",
          purpose: onboardingPurpose,
          durationType: budgetDuration ?? "month",
          startDate,
          endDate: budgetDuration === "custom" ? customEndDate : null,
          categories: selectedCategories.map((name, position) => ({ name, plannedAmount: Math.max(0, Math.round(Number(categoryBudgets[name] ?? 0))), priority: ONBOARDING_CATEGORY_TIERS.find((item) => item.categories.some((category) => category === name))?.priority ?? 4, isCustom: customCategories.includes(name), position })),
        }),
      });
      if (!response.ok) throw new Error("Could not save your budget plan");
    }
    if (selectedIncomeStreams.length > 0) {
      await Promise.allSettled(selectedIncomeStreams.map(async (name) => {
        const response = await fetch("/api/income-sources", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, name, isMain: false, expectedMonthlyAmount: 0 }),
        });
        if (!response.ok && response.status !== 409) throw new Error("Could not save income preference");
      }));
    }
  };

  const chooseWorkspace = async (workspace: Workspace) => {
    if (selectWorkspace.isPending) return;
    setSelectionError(null);
    setDuplicateCategoryNotice(null);
    try {
      if (!workspace.isPrivate && selectedCategories.length > 0) {
        const response = await fetch(`/api/onboarding/duplicate-categories?groupId=${workspace.id}`, { credentials: "include" });
        if (response.ok) {
          const result = await response.json() as { duplicates?: string[] };
          const repeated = (result.duplicates ?? []).filter((name) => selectedCategories.includes(name));
          if (repeated.length > 0) {
            const proceed = window.confirm(`Some selected categories already exist in your Personal budget: ${repeated.join(", ")}. Personal and Shared budgets keep separate category records, so these will be created separately for group spending. Continue?`);
            if (!proceed) return;
          }
        }
      }
      // The only ID sent comes from the server-returned workspace list.
      await selectWorkspace.mutateAsync({ data: { groupId: workspace.id } });
      await applyOnboardingPreferences(workspace);
      enterApp();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Could not open that budget. Please try again.");
    }
  };

  const createStandaloneSharedBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = sharedBudgetName.trim();
    if (name.length < 2) {
      setCreationError("Enter a name with at least two characters.");
      return;
    }
    if (!sharedBudgetKind) {
      setCreationError("Choose what this Shared budget is for.");
      return;
    }

    setCreationError(null);
    try {
      const workspace = await createSharedGroup.mutateAsync({
        data: { name, kind: sharedBudgetKind as GroupKind },
      });
      // Creation currently selects the workspace server-side. Select explicitly as
      // well so this flow remains safe if that implementation changes.
      await queryClient.invalidateQueries({ queryKey: getGetWorkspacesQueryKey() });
      await selectWorkspace.mutateAsync({ data: { groupId: workspace.id } });
      await applyOnboardingPreferences(workspace);
      enterApp();
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "Could not create that Shared budget. Please try again.");
    }
  };

  const personal = workspaces.filter((workspace) => workspace.isPrivate);
  const shared = workspaces.filter((workspace) => !workspace.isPrivate).sort((a, b) => a.name.localeCompare(b.name));
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? personal[0] ?? shared[0] ?? null;
  const selectedName = selectedWorkspace?.isPrivate ? "Personal budget" : selectedWorkspace ? workspaceLabel(selectedWorkspace) : "";

  if (!onboardingMode) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl items-center">
          <div className="w-full overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl">
            <header className="border-b border-primary/10 bg-primary px-6 py-8 text-primary-foreground sm:px-10 sm:py-10">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Welcome to Jamvi</p>
              <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">Let’s set up Jamvi for you{user.firstName ? `, ${user.firstName}` : ""}.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">One account can hold your private Personal budget and the Shared budgets you choose to create with other people.</p>
            </header>
            <div className="p-6 sm:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">First, a quick question</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-foreground">How will you use Jamvi?</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">This helps us take you to the right starting point. You can always add another budget later.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {([
                  ["personal", "My money", "A private budget for my income, spending, and goals.", Wallet],
                  ["shared", "Money with others", "A shared budget for a family, chama, club, or team.", UsersRound],
                  ["both", "Both", "Keep my personal money private and manage shared money too.", Heart],
                ] as const).map(([value, title, description, Icon]) => (
                  <button key={value} type="button" onClick={() => { setOnboardingMode(value); setShowPurposeSetup(true); }} className="group rounded-2xl border border-border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span className="mt-4 block text-base font-bold text-foreground">{title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span>
                    <span className="mt-4 block text-sm font-semibold text-primary">Continue <ChevronRight className="ml-1 inline h-4 w-4" aria-hidden="true" /></span>
                  </button>
                ))}
              </div>
              <p className="mt-6 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Your choice does not lock you in.</span> Personal records stay private, and Shared budgets are only visible to the people you invite.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (showPurposeSetup) {
    const purposeOptions = onboardingMode === "shared"
      ? [["couple", "A couple", "Plan shared household money together."], ["friends", "Friends or roommates", "Split trips, bills, rent, and plans with friends."], ["family", "A family", "Coordinate home costs, school, health, and support."], ["chama", "A chama or welfare group", "Track contributions, welfare, loans, and group plans."], ["club", "A club, church, or team", "Manage membership money, events, and projects."], ["other", "Something else", "Tell Jamvi what matters to your group."]] as const
      : [["student", "A student", "Balance school life, living costs, and personal goals."], ["working", "Working or employed", "Plan income, household costs, and future goals."], ["business", "A business owner", "Separate business costs, personal spending, and income."], ["other", "Something else", "Build a budget around your own priorities."]] as const;
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10"><section className="mx-auto w-full max-w-3xl"><div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl"><header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Step 2 of 6 · Make it yours</p><h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">{user.firstName ? `${user.firstName}, what are you using Jamvi for?` : "What are you using Jamvi for?"}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">Your answer helps us recommend categories that fit your life instead of showing you a generic budget.</p></header><div className="p-6 sm:p-10"><div className="grid gap-3 sm:grid-cols-2">{purposeOptions.map(([value, title, description]) => { const selected = onboardingPurpose === value; return <button key={value} type="button" aria-pressed={selected} onClick={() => setOnboardingPurpose(value)} className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}><span className="flex items-center justify-between gap-3"><span className="font-bold text-foreground">{title}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}</span></span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span></button>; })}</div><div className="mt-8 flex justify-end"><Button type="button" disabled={!onboardingPurpose} className="h-12 rounded-xl px-6" onClick={() => { try { window.localStorage.setItem(`jamvi:onboarding:purpose:${encodeURIComponent(userId)}`, onboardingPurpose ?? ""); } catch { /* Continue even when storage is unavailable. */ } setShowPurposeSetup(false); setShowDurationSetup(true); }}>Continue to duration <ChevronRight className="ml-2 h-4 w-4" /></Button></div></div></div></section></main>
    );
  }

  if (showDurationSetup) {
    const durationOptions = [
      ["ongoing", "Everyday budgeting", "For your regular personal or shared money."],
      ["week", "Up to 1 week", "For a short trip, event, or weekly plan."],
      ["month", "Up to 1 month", "For a monthly challenge, project, or trip."],
      ["quarter", "Up to 3 months", "For a school term, campaign, or longer project."],
      ["custom", "Set an end date", "Choose the exact date this budget should finish."],
    ] as const;
    const canContinue = budgetDuration !== null && (budgetDuration !== "custom" || Boolean(customEndDate));
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl">
            <header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Step 3 of 6 · Choose your planning horizon</p>
              <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">{user.firstName ? `${user.firstName}, how long is this budget for?` : "How long is this budget for?"}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">A trip budget needs a finish line. An everyday budget can stay open. Tell Jamvi how to help you plan.</p>
            </header>
            <div className="p-6 sm:p-10">
              <div className="grid gap-3 sm:grid-cols-2">
                {durationOptions.map(([value, title, description]) => {
                  const selected = budgetDuration === value;
                  return <button key={value} type="button" aria-pressed={selected} onClick={() => setBudgetDuration(value)} className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}><span className="flex items-center justify-between gap-3"><span className="font-bold text-foreground">{title}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}</span></span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span></button>;
                })}
              </div>
              {budgetDuration === "custom" && <div className="mt-5 max-w-sm"><label htmlFor="budget-end-date" className="text-sm font-semibold text-foreground">Budget end date</label><Input id="budget-end-date" type="date" min={new Date().toISOString().slice(0, 10)} value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} className="mt-2" /></div>}
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">You can change this later</p><Button type="button" disabled={!canContinue} className="h-12 rounded-xl px-6" onClick={() => { try { window.localStorage.setItem(`jamvi:onboarding:duration:${encodeURIComponent(userId)}`, JSON.stringify({ type: budgetDuration, endDate: budgetDuration === "custom" ? customEndDate : null })); } catch { /* Continue even when storage is unavailable. */ } setShowDurationSetup(false); setShowCategorySetup(true); }}>Continue to categories <ChevronRight className="ml-2 h-4 w-4" /></Button></div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (showCategorySetup) {
    const recommendedCategories = [...(onboardingPurpose ? (PURPOSE_CATEGORY_MAP[onboardingPurpose] ?? ALL_ONBOARDING_CATEGORIES) : ALL_ONBOARDING_CATEGORIES), ...customCategories];
    const visibleTiers = ONBOARDING_CATEGORY_TIERS.map((tier) => ({ ...tier, categories: tier.categories.filter((category) => recommendedCategories.includes(category)) })).filter((tier) => tier.categories.length > 0);
    if (customCategories.length > 0) visibleTiers.push({ priority: 5, label: "Your categories", description: "Custom categories you added for your own situation.", categories: customCategories });
    const allSelected = recommendedCategories.every((category) => selectedCategories.includes(category));
    const toggleCategory = (category: string) => setSelectedCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
    const addCustomCategory = () => { const category = customCategory.trim(); if (category && !customCategories.includes(category)) { setCustomCategories((current) => [...current, category]); setSelectedCategories((current) => [...current, category]); } setCustomCategory(""); };
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto w-full max-w-4xl">
          <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl">
            <header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Step 4 of 6 · Personalize your budget</p>
              <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">{user.firstName ? `${user.firstName}, what should we help you track?` : "What should we help you track?"}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">Choose the expense categories you want to see first. You can change them and add your own later.</p>
            </header>
            <div className="p-6 sm:p-10">
              <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold text-foreground">Start with the essentials</p><p className="mt-1 text-sm text-muted-foreground">Priorities keep your first budget focused and useful.</p></div>
                <button type="button" aria-pressed={allSelected} onClick={() => setSelectedCategories(allSelected ? [] : [...recommendedCategories])} className="rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10">{allSelected ? "Clear all" : "Select all recommended categories"}</button>
              </div>
              <p className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Planning a goal?</span> Savings, emergency funds, and joint savings are managed separately under Goals—not as expenses.</p><div className="mt-6 space-y-6">
                {visibleTiers.map((tier) => (
                  <section key={tier.priority} aria-labelledby={`onboarding-tier-${tier.priority}`}>
                    <div className="mb-3"><h2 id={`onboarding-tier-${tier.priority}`} className="font-display text-lg font-bold text-foreground">Tier {tier.priority} · {tier.label}</h2><p className="text-sm text-muted-foreground">{tier.description}</p></div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {tier.categories.map((category) => {
                        const selected = selectedCategories.includes(category);
                        return <button key={category} type="button" aria-pressed={selected} onClick={() => toggleCategory(category)} className={`flex min-h-12 items-center justify-between rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}><span>{category}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}</span></button>;
                      })}
                    </div>
                  </section>
                ))}
              </div>
              <div className="mt-8 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-4"><p className="font-semibold text-foreground">Can’t find what you need?</p><p className="mt-1 text-sm text-muted-foreground">Add a category that is unique to your life, group, or short-term plan.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Custom budget category" placeholder="e.g. HELB, wedding venue, or trip fund" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomCategory(); } }} /><Button type="button" variant="outline" className="rounded-xl" onClick={addCustomCategory}>Add category</Button></div></div>
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{selectedCategories.length} of {recommendedCategories.length} recommended categories selected</p><Button type="button" className="h-12 rounded-xl px-6" onClick={() => { try { window.localStorage.setItem(`jamvi:onboarding:categories:${encodeURIComponent(userId)}`, JSON.stringify(selectedCategories)); } catch { /* Continue even when storage is unavailable. */ } setShowCategorySetup(false); setShowCategoryBudgetSetup(true); }}>Set budget amounts <ChevronRight className="ml-2 h-4 w-4" /></Button></div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (showCategoryBudgetSetup) {
    const totalBudget = selectedCategories.reduce((sum, category) => sum + (Number(categoryBudgets[category]) || 0), 0);
    const setCategoryBudget = (category: string, amount: string) => setCategoryBudgets((current) => ({ ...current, [category]: amount.replace(/[^0-9.]/g, "") }));
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10"><section className="mx-auto w-full max-w-3xl"><div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl"><header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Step 5 of 6 · Give your budget a plan</p><h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">{user.firstName ? `${user.firstName}, how much will you plan for each category?` : "How much will you plan for each category?"}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">Set an amount for the categories you selected. These are plans, not restrictions—you can adjust them anytime.</p></header><div className="p-6 sm:p-10">{selectedCategories.length > 0 ? <div className="space-y-3">{selectedCategories.map((category) => <div key={category} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><label htmlFor={`budget-${category}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{category}</label><div className="flex w-36 items-center gap-2"><span className="text-sm text-muted-foreground">KES</span><Input id={`budget-${category}`} inputMode="decimal" type="text" placeholder="0" value={categoryBudgets[category] ?? ""} onChange={(event) => setCategoryBudget(category, event.target.value)} className="h-10 text-right" /></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">You did not select expense categories. You can add them later from your Budget page.</div>}<div className="mt-6 flex items-center justify-between rounded-xl bg-primary/[0.05] px-4 py-3"><span className="text-sm font-semibold text-muted-foreground">Planned total</span><span className="font-display text-xl font-bold text-foreground">KES {totalBudget.toLocaleString("en-KE")}</span></div><div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Amounts can be changed later</p><Button type="button" className="h-12 rounded-xl px-6" onClick={() => { try { window.localStorage.setItem(`jamvi:onboarding:category-budgets:${encodeURIComponent(userId)}`, JSON.stringify(categoryBudgets)); } catch { /* Continue even when storage is unavailable. */ } setShowCategoryBudgetSetup(false); setShowIncomeSetup(true); }}>Continue to income setup <ChevronRight className="ml-2 h-4 w-4" /></Button></div></div></div></section></main>
    );
  }

  if (showIncomeSetup) {
    const isSharedSetup = onboardingMode === "shared";
    const incomeHeading = isSharedSetup ? "What will bring money into your Shared budget?" : "What brings money into your budget?";
    const incomeDescription = isSharedSetup
      ? "Choose the sources you expect members to contribute from. Each person can add their own source later."
      : "Choose the sources you rely on so Jamvi can help you see what is available to plan with.";
    const toggleIncomeStream = (stream: string) => setSelectedIncomeStreams((current) => current.includes(stream) ? current.filter((item) => item !== stream) : [...current, stream]);
    const addCustomIncomeStream = () => {
      const stream = customIncomeStream.trim();
      if (stream && !selectedIncomeStreams.includes(stream)) setSelectedIncomeStreams((current) => [...current, stream]);
      setCustomIncomeStream("");
    };
    const finishOnboarding = async () => {
      await fetch("/api/onboarding/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageMode: onboardingMode, persona: onboardingPurpose, budgetDuration, budgetEndDate: budgetDuration === "custom" ? customEndDate : null, categoryNames: selectedCategories, incomeStreams: selectedIncomeStreams, completed: true, onboardingVersion: 1 }),
      }).catch(() => undefined);
      try {
        window.localStorage.setItem(`jamvi:onboarding:income-streams:${encodeURIComponent(userId)}`, JSON.stringify(selectedIncomeStreams));
      } catch { /* Continue even when storage is unavailable. */ }
      setShowIncomeSetup(false);
    };
    return (
      <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl">
            <header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Step 6 of 6 · Personalize your starting point</p>
              <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">{user.firstName ? `${user.firstName}, ${incomeHeading.charAt(0).toLowerCase()}${incomeHeading.slice(1)}` : incomeHeading}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">{incomeDescription} You can add amounts and more sources later.</p>
            </header>
            <div className="p-6 sm:p-10">
              <div className="grid gap-2 sm:grid-cols-2">
                {COMMON_INCOME_STREAMS.map((stream) => {
                  const selected = selectedIncomeStreams.includes(stream);
                  return <button key={stream} type="button" aria-pressed={selected} onClick={() => toggleIncomeStream(stream)} className={`flex min-h-12 items-center justify-between rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}><span>{stream}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}</span></button>;
                })}
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row"><Input aria-label="Custom income stream" placeholder="Add another income stream" value={customIncomeStream} onChange={(event) => setCustomIncomeStream(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomIncomeStream(); } }} /><Button type="button" variant="outline" className="rounded-xl" onClick={addCustomIncomeStream}>Add source</Button></div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Income streams are private to you in a Personal budget. In a Shared budget, each member can record their own source.</p>
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{selectedIncomeStreams.length} income {selectedIncomeStreams.length === 1 ? "stream" : "streams"} selected</p><Button type="button" className="h-12 rounded-xl px-6" onClick={finishOnboarding}>Continue to my budgets <ChevronRight className="ml-2 h-4 w-4" /></Button></div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const onboardingHeading = onboardingMode === "personal" ? "Start with your Personal budget." : onboardingMode === "shared" ? "Choose or create your Shared budget." : "Choose where to start today.";

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-5xl">
        <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-xl">
          <header className="border-b border-primary/10 bg-primary px-6 py-7 text-primary-foreground sm:px-10 sm:py-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Your budgets</p>
            <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl">{onboardingHeading}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/75 sm:text-base">Your private and Shared budgets stay separate in Jamvi.</p>
          </header>

          <div className="p-6 sm:p-10">
            {selectionError ? <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{selectionError}</p> : null}
            {duplicateCategoryNotice ? <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-foreground" role="status"><span className="font-semibold">Shared budget notice:</span> {duplicateCategoryNotice}</p> : null}
            {isLoading ? <div className="h-36 animate-pulse rounded-2xl bg-muted" role="status" aria-label="Loading budgets" /> : workspaceLoadFailed ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center" role="alert">
                <h2 className="font-display text-xl font-bold text-foreground">Your budgets could not load</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Check your connection and try again. Nothing has been changed.</p>
                <Button type="button" variant="outline" className="mt-5 rounded-xl" onClick={() => void refetchWorkspaces()}>Try again</Button>
              </div>
            ) : (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] lg:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Your budgets</p>
                  <h2 className="mt-2 font-display text-2xl font-bold text-foreground">Choose a budget</h2>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Click a budget to open it.</p>

                    <div className="mt-6 border-l-2 border-border pl-4">
                    <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-foreground">Personal budget</h3></div>
                    {personal.length ? <div className="grid gap-3">{personal.map((workspace) => <WorkspaceButton key={workspace.id} workspace={workspace} personalPhotoUrl={user.profileImageUrl} label="Private to you" selected={selectedWorkspace?.id === workspace.id} pending={selectWorkspace.isPending} onChoose={(item) => { setSelectedWorkspaceId(item.id); void chooseWorkspace(item); }} />)}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">You do not need a Personal budget to get started. Create or open a Shared budget below.</p>}
                  </div>

                  <div className="mt-7 border-l-2 border-border pl-4">
                    <div className="mb-3 flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#087F8C]" /><h3 className="text-sm font-bold text-foreground">Shared budgets</h3></div>
                      {personal.length === 0 ? (
                        <StandaloneSharedBudgetForm
                          name={sharedBudgetName}
                          kind={sharedBudgetKind}
                          error={creationError}
                          pending={createSharedGroup.isPending || selectWorkspace.isPending}
                          onNameChange={setSharedBudgetName}
                          onKindChange={setSharedBudgetKind}
                          onSubmit={createStandaloneSharedBudget}
                        />
                      ) : null}
                    {shared.length ? <div className="grid gap-3">{shared.map((workspace) => <WorkspaceButton key={workspace.id} workspace={workspace} label={groupKindPresentation(workspace.kind).label} selected={selectedWorkspace?.id === workspace.id} pending={selectWorkspace.isPending} onChoose={(item) => { setSelectedWorkspaceId(item.id); void chooseWorkspace(item); }} />)}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No Shared budgets yet. Create one or open an invitation link.</p>}
                  </div>
                </div>

                <aside className="order-first rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 lg:order-none" aria-live="polite">
                  {selectedWorkspace ? <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Check className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Ready to open</p>
                        <h2 className={`mt-1 truncate font-display text-xl font-bold text-foreground ${selectedWorkspace.isPrivate ? "" : workspaceNameClass(selectedWorkspace.nameStyle)}`}>{selectedName}</h2>
                      </div>
                    </div>
                    <Button type="button" className="mt-6 h-12 w-full justify-between rounded-xl px-4" disabled={selectWorkspace.isPending} onClick={() => void chooseWorkspace(selectedWorkspace)}>
                      <span>{selectWorkspace.isPending ? "Opening…" : `Open ${selectedName}`}</span><ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </> : <p className="text-sm text-muted-foreground">Choose a budget to see the next step.</p>}

                </aside>
              </div>
            )}
          </div>
        </div>
      </section>

    </main>
  );
}

function StandaloneSharedBudgetForm({
  name, kind, error, pending, onNameChange, onKindChange, onSubmit,
}: {
  name: string;
  kind: SharedGroupKind | null;
  error: string | null;
  pending: boolean;
  onNameChange: (name: string) => void;
  onKindChange: (kind: SharedGroupKind) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mb-5 rounded-2xl border border-primary/25 bg-primary/[0.05] p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Start here</p>
      <h4 className="mt-1 font-display text-lg font-bold text-foreground">Create a Shared budget</h4>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Start with a department, chama, church, club, team, project, or another shared purpose.</p>
      <div className="mt-4 space-y-2">
        <label htmlFor="standalone-shared-budget-name" className="text-sm font-semibold text-foreground">Budget name</label>
        <Input id="standalone-shared-budget-name" data-testid="input-standalone-shared-budget-name" maxLength={60} placeholder="e.g. Mwangaza Chama" value={name} onChange={(event) => onNameChange(event.target.value)} disabled={pending} />
      </div>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-semibold text-foreground">What is it for?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SHARED_GROUP_KINDS.map((option) => (
            <button key={option.value} data-testid={`button-standalone-kind-${option.value}`} type="button" aria-pressed={kind === option.value} disabled={pending} onClick={() => onKindChange(option.value)} className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 ${kind === option.value ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50"}`}>
              <span className="block text-sm font-semibold text-foreground">{option.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {error ? <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert" data-testid="status-standalone-shared-budget-error">{error}</p> : null}
      <Button data-testid="button-create-standalone-shared-budget" type="submit" className="mt-5 h-12 w-full rounded-xl" disabled={pending}>
        <Plus className="mr-2 h-4 w-4" />{pending ? "Creating…" : "Create and open Shared budget"}
      </Button>
    </form>
  );
}

function WorkspaceButton({ workspace, personalPhotoUrl, label, selected, pending, onChoose }: { workspace: Workspace; personalPhotoUrl?: string | null; label: string; selected: boolean; pending: boolean; onChoose: (workspace: Workspace) => void }) {
  return <button type="button" disabled={pending} aria-pressed={selected} aria-label={`Open ${workspace.isPrivate ? "Personal budget" : workspaceLabel(workspace)}`} onClick={() => onChoose(workspace)} className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 ${selected ? "border-primary bg-primary/[0.06] ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/50 hover:bg-primary/[0.03]"}`}><WorkspaceIdentity workspace={workspace} personalPhotoUrl={personalPhotoUrl} /><span className="min-w-0 flex-1"><span className={`block truncate text-base text-foreground ${workspace.isPrivate ? "" : workspaceNameClass(workspace.nameStyle)}`}>{workspace.isPrivate ? "Personal budget" : workspaceLabel(workspace)}</span><span className="mt-1 block text-xs font-medium text-muted-foreground">{label}</span></span><span className={`flex items-center gap-1 text-xs font-bold ${selected ? "text-primary" : "text-muted-foreground"}`}>{selected ? <><Check className="h-4 w-4" />Opening…</> : <><span className="hidden sm:inline">Open</span><ChevronRight className="h-4 w-4" /></>}</span></button>;
}
