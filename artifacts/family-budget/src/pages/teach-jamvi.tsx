import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Heart, Loader2, X } from "lucide-react";
import {
  getGetBudgetCategoriesQueryKey,
  getGetJointAccountQueryKey,
  useCreateBudgetCategory,
  useGetBudgetCategories,
  useGetGroup,
  useGetIncomeSources,
  useUpdateJointAccountTransaction,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { isNotSure, type EntryToSort } from "@/lib/entries-to-sort";
import { payeeKey, withRule, withSourceRule, type PayeeRules } from "@/lib/payee-learning";
import { readCachedRules, saveRules, syncRules } from "@/lib/rules-store";
import { incomeAnswers, savedGroups, suggestedCategories, type SavedGroup } from "@/lib/teach-jamvi";
import { displayName, FAMILY_CATEGORY, familyCategories, familyNames, relativesBySurname, withFamily, withoutFamily } from "@/lib/family";
import { SALARY_ANSWERS, salaryAnswerHint, unansweredBusinesses, type SalaryBusiness } from "@/lib/business-salary";
import { plainSaveError } from "@/lib/save-retry";

/**
 * Teach Jamvi your M-Pesa, on the web (the phone's app/teach-jamvi): each
 * business's salary question, your family, and the regulars among the entries
 * saved as Not sure - answered once, kept on the server, so imports on the
 * phone and here file them by themselves. The logic is the phone's own
 * (lib/teach-jamvi, lib/family, lib/business-salary are its twins).
 */
export default function TeachJamviPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const { data, isLoading } = useQuery<{ entries: EntryToSort[] }>({
    queryKey: ["entries-to-sort"],
    queryFn: async () => {
      const response = await fetch("/api/entries-to-sort", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your entries");
      return response.json();
    },
  });
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const { data: categoryList = [] } = useGetBudgetCategories();
  const { data: incomeSources = [] } = useGetIncomeSources();
  const updateTx = useUpdateJointAccountTransaction();
  const createCategory = useCreateBudgetCategory();
  const { data: businessData, refetch: refetchBusinesses } = useQuery<{ businesses?: SalaryBusiness[] }>({
    queryKey: ["businesses"],
    queryFn: async () => {
      const response = await fetch("/api/businesses", { credentials: "include" });
      return response.ok ? response.json() : {};
    },
  });
  const businesses = businessData?.businesses ?? [];

  const [rules, setRules] = useState<PayeeRules>({});
  useEffect(() => {
    let active = true;
    setRules(readCachedRules(group?.id));
    void syncRules(group?.id).then((synced) => { if (active && synced) setRules(synced); });
    return () => { active = false; };
  }, [group?.id]);
  const keepRules = (next: PayeeRules) => {
    const before = rules;
    setRules(next);
    void saveRules(group?.id, next, before);
  };

  const rows = categoryList as unknown as Array<{ id: number; name: string; parentId?: number | null }>;
  const leafNames = useMemo(() => {
    const parents = new Set(rows.map((row) => row.parentId).filter((id): id is number => id != null));
    return rows.filter((row) => !parents.has(row.id) && !isNotSure(row.name)).map((row) => row.name).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const familyLeaves = useMemo(() => familyCategories(rows), [rows]);
  const familyChoices = familyLeaves.length > 0 ? familyLeaves : [FAMILY_CATEGORY];
  const keptFamily = useMemo(() => familyNames(rules, familyChoices), [rules, familyChoices]);
  const surname = (user as { lastName?: string | null } | null)?.lastName;
  const familySuggestions = useMemo(
    () => relativesBySurname(entries.filter((entry) => entry.direction === "out").map((entry) => entry.description), surname, keptFamily.map((one) => one.key)),
    [entries, surname, keptFamily],
  );

  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [moreOf, setMoreOf] = useState(false);
  const groups = useMemo(() => savedGroups(entries, rules, { skipped }), [entries, rules, skipped]);
  const regular = groups[0] ?? null;

  const ensureCategory = async (name: string) => {
    if (rows.some((row) => row.name === name)) return;
    await createCategory.mutateAsync({ data: { name, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } as never });
    await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
  };
  const fileEntries = async (list: readonly EntryToSort[], change: Record<string, unknown>) => {
    for (const one of list) await updateTx.mutateAsync({ id: one.id, data: { amount: one.amount, date: one.date, ...change } as never });
    queryClient.setQueryData<{ entries: EntryToSort[] }>(["entries-to-sort"], (cached) =>
      cached ? { entries: cached.entries.filter((entry) => !list.some((one) => one.id === entry.id)) } : cached);
    void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
  };
  const run = async (task: () => Promise<void>) => {
    setWorking(true);
    try { await task(); } catch (error) {
      toast({ title: "Could not save that", description: plainSaveError(error), variant: "destructive" });
    } finally { setWorking(false); }
  };

  const answerCategory = (taught: SavedGroup, category: string) => run(async () => {
    await ensureCategory(category);
    keepRules(taught.key.startsWith("#ref:") ? { ...rules, [taught.key]: category } : withRule(rules, taught.entries[0].description, category));
    await fileEntries(taught.entries, { expenseCategory: category });
  });
  const answerSource = (taught: SavedGroup, incomeSourceId: number) => run(async () => {
    keepRules(withSourceRule(rules, taught.entries[0].description, incomeSourceId));
    const owner = (incomeSources as Array<{ id: number; userId?: string | null }>).find((source) => source.id === incomeSourceId)?.userId;
    await fileEntries(taught.entries, { incomeSourceId, ...(owner ? { madeById: owner } : {}) });
  });
  const answerSalary = (business: SalaryBusiness, paysSalary: boolean) => run(async () => {
    const response = await fetch(`/api/businesses/${business.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: true, paysSalary }),
    });
    if (!response.ok) throw new Error("Could not save that answer.");
    await refetchBusinesses();
  });

  const [familyName, setFamilyName] = useState("");
  const [familyCategory, setFamilyCategory] = useState(familyChoices[0]);
  useEffect(() => { setFamilyCategory(familyChoices[0]); }, [familyChoices.join("|")]);
  const addFamily = (name: string) => run(async () => {
    if (!name.trim()) return;
    await ensureCategory(familyCategory);
    keepRules(withFamily(rules, name, familyCategory));
    const key = payeeKey(name);
    await fileEntries(entries.filter((entry) => entry.direction === "out" && payeeKey(entry.description) === key), { expenseCategory: familyCategory });
    setFamilyName("");
  });

  const askSalary = unansweredBusinesses(businesses)[0];
  const answers = regular && regular.direction === "in" ? incomeAnswers(regular.label, incomeSources as Array<{ id: number; name: string }>, businesses) : null;
  const chip = (label: string, onClick: () => void, testId: string, icon?: ReactNode) => (
    <Button key={testId} type="button" variant="outline" size="sm" className="rounded-full" disabled={working} onClick={onClick} data-testid={testId}>
      {icon}{label}
    </Button>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/settings" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-xl font-bold">Teach Jamvi your M-Pesa</h1>
      </div>
      <p className="text-sm text-muted-foreground">Answer these once, and Jamvi files the money by itself on the phone and here.</p>

      {askSalary ? (
        <Card data-testid="teach-salary"><CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-primary"><BriefcaseBusiness className="h-4 w-4" /> YOUR BUSINESS</p>
          <p className="font-semibold">Do you pay yourself a salary from {askSalary.name}?</p>
          <p className="text-sm text-muted-foreground">{salaryAnswerHint(askSalary)}</p>
          <div className="flex flex-wrap gap-2">
            {SALARY_ANSWERS.map((answer) => chip(answer.label, () => void answerSalary(askSalary, answer.paysSalary), `teach-salary-${answer.paysSalary ? "yes" : "no"}`))}
          </div>
        </CardContent></Card>
      ) : null}

      <Card data-testid="teach-family"><CardContent className="space-y-3 p-4">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-primary"><Heart className="h-4 w-4" /> YOUR FAMILY</p>
        <p className="font-semibold">Who do you send money to in your family?</p>
        <p className="text-sm text-muted-foreground">Money to them counts as family support, never shopping. Write each name as it shows in your M-Pesa messages.</p>
        {keptFamily.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keptFamily.map((one) => (
              <span key={one.key} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                {displayName(one.key)} · {one.category}
                <button type="button" aria-label={`Remove ${displayName(one.key)}`} onClick={() => keepRules(withoutFamily(rules, one.key))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        ) : null}
        {familyChoices.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {familyChoices.map((category) => (
              <Button key={category} type="button" size="sm" variant={familyCategory === category ? "default" : "outline"} className="rounded-full" onClick={() => setFamilyCategory(category)}>{category}</Button>
            ))}
          </div>
        ) : null}
        {familySuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">{familySuggestions.map((name) => chip(`+ ${name}`, () => void addFamily(name), `teach-family-suggest-${name}`))}</div>
        ) : null}
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void addFamily(familyName); }}>
          <Input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="e.g. JANE WANJIKU KAMAU" data-testid="teach-family-input" />
          <Button type="submit" disabled={!familyName.trim() || working}>Add</Button>
        </form>
      </CardContent></Card>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : regular ? (
        <Card data-testid="teach-regular"><CardContent className="space-y-3 p-4">
          <p className="text-xs font-bold tracking-wide text-primary">YOUR REGULARS · {groups.length} TO GO</p>
          <p className="text-lg font-bold">{regular.label}{regular.reference ? ` · ${regular.reference}` : ""}</p>
          <p className="text-sm text-muted-foreground">{regular.direction === "in" ? "Received" : "Paid"} {regular.count} times · KES {Math.round(regular.total).toLocaleString("en-KE")}</p>
          {regular.direction === "out" ? (
            <>
              <p className="font-semibold">{regular.kind === "person" ? `Who is ${regular.label} to you?` : `What do you pay ${regular.label} for?`}</p>
              <div className="flex flex-wrap gap-2">
                {suggestedCategories(regular, [...familyChoices, ...leafNames], undefined).map((name) => chip(name, () => void answerCategory(regular, name), `teach-category-${name}`))}
              </div>
              <select className="w-full rounded-md border bg-background p-2 text-sm" defaultValue="" disabled={working}
                onChange={(event) => { if (event.target.value) void answerCategory(regular, event.target.value); }} data-testid="teach-category-pick">
                <option value="">Pick a category…</option>
                {leafNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </>
          ) : answers ? (
            <>
              <p className="font-semibold">What is the money from {regular.label}?</p>
              {answers.income.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground">YOUR INCOME</p>
                  <div className="flex flex-wrap gap-2">
                    {(moreOf ? answers.income : answers.income.slice(0, 3)).map((source) => chip(source.name, () => void answerSource(regular, source.id), `teach-source-${source.id}`))}
                  </div>
                </div>
              ) : null}
              {answers.sales.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground">A BUSINESS'S SALES</p>
                  <div className="flex flex-wrap gap-2">
                    {(moreOf ? answers.sales : answers.sales.slice(0, 3)).map((business) => chip(business.name, () => void answerSource(regular, business.id), `teach-sales-${business.id}`, <BriefcaseBusiness className="mr-1 h-3 w-3" />))}
                  </div>
                </div>
              ) : null}
              {!moreOf && (answers.income.length > 3 || answers.sales.length > 3) ? (
                <Button type="button" variant="link" className="px-0" onClick={() => setMoreOf(true)}>Other…</Button>
              ) : null}
            </>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setSkipped((current) => new Set([...current, regular.key]))} data-testid="teach-skip">
            It varies: skip
          </Button>
        </CardContent></Card>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="teach-nothing">Nothing else to ask: Jamvi knows where your regular payments go.</p>
      )}
    </div>
  );
}
