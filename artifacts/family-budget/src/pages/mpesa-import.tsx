import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  useCreateDeposit,
  useCreateDisbursement,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { buildCategoryTree, type CategoryRow } from "@workspace/category-tree";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CategorySearchInput, useCategorySearch } from "@/components/category-search";
import { formatKes } from "@/lib/utils";
import {
  buildPostings,
  initialChoices,
  isRecordable,
  lineLabel,
  problemWith,
  snippetFor,
  summarise,
  type Choice,
  type PreviewLine,
} from "@/lib/mpesa-import";

// Shared with the day of banking and the Bank form: a fee is the same expense every time.
const CHARGE_CATEGORY_KEY = "jamvi:last-charge-category";

const todayIso = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

type Outcome = { saved: number; repeats: number; failed: Array<{ what: string; why: string }> };

const SELECT_CLASS = "flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

/**
 * Paste M-Pesa messages, look over what Jamvi read, and save the lot.
 *
 * Nothing is recorded until Save is pressed, every payment needs a category
 * that was seen on screen, and a message already recorded is skipped, never
 * counted twice. What was pasted is read and forgotten.
 */
export default function MpesaImportPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const isShared = group?.isPrivate === false;

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Array<{ id: number; name: string }>;
  const { data: categoryList = [] } = useGetBudgetCategories();
  const categories = categoryList as unknown as CategoryRow[];
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const search = useCategorySearch(categoryTree);
  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  // M-Pesa is usually its own account: start on one that says so.
  const guessedAccount = accounts.find((account) => /m-?pesa/i.test(account.name))?.id ?? accounts[0]?.id ?? null;
  const accountId = selectedAccountId ?? guessedAccount;
  const { data: account } = useGetJointAccount(accountId ? { accountId } : undefined);
  const history = useMemo(
    () => (account?.transactions ?? []) as Array<{ type: string; description: string; expenseCategory?: string | null }>,
    [account],
  );

  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [chargeCategory, setChargeCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHARGE_CATEGORY_KEY);
      if (stored) setChargeCategory(stored);
    } catch {
      /* remembered only when storage allows */
    }
  }, []);

  const readMessages = async () => {
    if (!text.trim()) {
      toast({ variant: "destructive", title: "Paste your messages", description: "Copy them from your Messages app, then paste them here." });
      return;
    }
    setReading(true);
    try {
      const response = await fetch("/api/mpesa/import/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json().catch(() => ({}))) as { lines?: PreviewLine[]; error?: string };
      if (!response.ok || !body.lines) throw new Error(body.error ?? "Could not read them.");
      setLines(body.lines);
      setChoices(initialChoices(body.lines, history));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not read them", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setReading(false);
    }
  };

  const summary = useMemo(() => (lines ? summarise(lines, choices) : null), [lines, choices]);
  const firstProblem = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) {
      const problem = problemWith(item, choices[item.index]);
      if (problem) return `${lineLabel(item)}: ${problem}`;
    }
    if (summary && summary.fees > 0 && !chargeCategory.trim()) return "Choose a category for the M-Pesa charges.";
    return null;
  }, [lines, choices, summary, chargeCategory]);

  const recordable = lines?.filter(isRecordable) ?? [];
  const notImported = lines?.filter((item) => !isRecordable(item)) ?? [];

  const setCategory = (index: number, category: string) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], category } }));

  const saveAll = async () => {
    if (!lines || !accountId || saving) return;
    if (firstProblem) {
      toast({ variant: "destructive", title: "Not quite ready", description: firstProblem });
      return;
    }
    setSaving(true);
    const result: Outcome = { saved: 0, repeats: 0, failed: [] };
    try {
      for (const item of lines) {
        const choice = choices[item.index];
        if (!choice?.include || !isRecordable(item)) continue;
        const built = buildPostings(item, choice, {
          accountId,
          userId: user?.id,
          isShared,
          today: todayIso(),
          chargeCategory,
        });
        if (!built) continue;
        try {
          if (built.kind === "deposit") {
            await createDeposit.mutateAsync({ data: built.main as never });
          } else {
            const created = await createDisbursement.mutateAsync({ data: built.main as never });
            if (built.fee) {
              try {
                await createDisbursement.mutateAsync({ data: { ...built.fee, chargeForTransactionId: created.id } as never });
              } catch {
                result.failed.push({ what: `${item.description} charge`, why: "The payment saved, but its charge did not." });
              }
            }
          }
          result.saved += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "It was not saved.";
          if (/already recorded/i.test(message)) result.repeats += 1;
          else result.failed.push({ what: item.description ?? "A message", why: message });
        }
      }
    } finally {
      setSaving(false);
      setOutcome(result);
    }
  };

  if (outcome) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6" data-testid="mpesa-import-done">
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
            <h1 className="text-2xl font-bold text-foreground">
              {outcome.saved} {outcome.saved === 1 ? "entry" : "entries"} saved
            </h1>
            {outcome.repeats > 0 ? <p className="text-sm text-muted-foreground">{outcome.repeats} already recorded, so left out.</p> : null}
            {outcome.failed.map((failure) => (
              <p key={`${failure.what}-${failure.why}`} className="text-sm text-destructive">{failure.what}: {failure.why}</p>
            ))}
          </CardContent>
        </Card>
        <div className="flex justify-center gap-3">
          <Link href="/bank"><Button>See my bank</Button></Link>
          <Button variant="outline" onClick={() => { setOutcome(null); setLines(null); setChoices({}); setText(""); }}>Paste more</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" data-testid="mpesa-import-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paste M-Pesa messages</h1>
        <p className="text-sm text-muted-foreground">Turn your M-Pesa messages into entries, without typing.</p>
      </div>

      {!lines ? (
        <>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm text-foreground">
              <p><span className="font-bold text-primary">1</span>  Open your Messages app and hold on an M-Pesa message.</p>
              <p><span className="font-bold text-primary">2</span>  Select the ones you want (as many as you like), then tap Copy.</p>
              <p><span className="font-bold text-primary">3</span>  Come back here and paste them in the box.</p>
            </CardContent>
          </Card>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={9}
            placeholder="Paste your M-Pesa messages here"
            className="w-full rounded-xl border border-input bg-card p-3 text-sm"
            data-testid="mpesa-import-text"
          />
          <p className="text-xs text-muted-foreground">Jamvi reads your messages to fill in this list. They are not saved.</p>
          <Button onClick={readMessages} disabled={reading} className="h-12 w-full" data-testid="mpesa-import-read">
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Read my messages"}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground" htmlFor="mpesa-account">Put them in which account?</label>
            <select
              id="mpesa-account"
              className={SELECT_CLASS}
              value={accountId ?? ""}
              onChange={(event) => {
                setSelectedAccountId(Number(event.target.value));
                // The suggestions come from this account's history, so start them again.
                setChoices(initialChoices(lines, []));
              }}
              data-testid="mpesa-import-account"
            >
              {accounts.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>

          {summary ? (
            <Card data-testid="mpesa-import-summary">
              <CardContent className="p-4">
                <p className="font-bold text-foreground">{summary.count} of {recordable.length} ready to save</p>
                <p className="text-sm text-muted-foreground">
                  Money in {formatKes(summary.moneyIn)} · money out {formatKes(summary.moneyOut)}
                  {summary.fees > 0 ? ` · M-Pesa charges ${formatKes(summary.fees)}` : ""}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {recordable.length > 0 ? <CategorySearchInput query={search.query} onChange={search.setQuery} testId="mpesa-category-search" /> : null}

          {recordable.map((item) => {
            const choice = choices[item.index];
            const out = item.direction === "out";
            return (
              <Card key={item.index} className={choice?.include ? "" : "opacity-55"} data-testid={`mpesa-line-${item.index}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!choice?.include}
                      onChange={(event) => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], include: event.target.checked } }))}
                      aria-label={`Save ${item.description}`}
                      className="h-5 w-5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{item.date ?? "No date on it, so today"} · {out ? "Money out" : "Money in"}</p>
                      {item.named === false && snippetFor(text, item.receipt) ? (
                        <p className="text-xs italic text-muted-foreground" data-testid={`mpesa-line-snippet-${item.index}`}>
                          No name in the message: “{snippetFor(text, item.receipt)}…”
                        </p>
                      ) : null}
                    </div>
                    <p className={`font-display text-lg font-bold ${out ? "text-destructive" : "text-success"}`}>
                      {out ? "−" : "+"}{formatKes(item.amount ?? 0)}
                    </p>
                  </div>
                  {out && choice?.include ? (
                    <select
                      className={`${SELECT_CLASS} ${choice.category ? "" : "border-destructive"}`}
                      value={choice.category}
                      onChange={(event) => setCategory(item.index, event.target.value)}
                      data-testid={`mpesa-line-category-${item.index}`}
                    >
                      <option value="">Choose what it was for</option>
                      {search.visible(choice.category).map((group) =>
                        group.children.length > 0 ? (
                          <optgroup key={group.name} label={group.name}>
                            {group.children.map((child) => <option key={child} value={child}>{child}</option>)}
                          </optgroup>
                        ) : (
                          <option key={group.name} value={group.name}>{group.name}</option>
                        ),
                      )}
                    </select>
                  ) : null}
                  {out && item.fee ? <p className="text-xs text-muted-foreground">+ {formatKes(item.fee)} M-Pesa charge, saved on its own</p> : null}
                </CardContent>
              </Card>
            );
          })}

          {summary && summary.fees > 0 ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <label className="text-sm font-semibold text-foreground" htmlFor="mpesa-charge-category">Where do the M-Pesa charges go?</label>
                <select
                  id="mpesa-charge-category"
                  className={`${SELECT_CLASS} ${chargeCategory ? "" : "border-destructive"}`}
                  value={chargeCategory}
                  onChange={(event) => {
                    setChargeCategory(event.target.value);
                    try { window.localStorage.setItem(CHARGE_CATEGORY_KEY, event.target.value); } catch { /* remembered only when storage allows */ }
                  }}
                  data-testid="mpesa-charge-category"
                >
                  <option value="">Choose a category for the charges</option>
                  {search.visible(chargeCategory).map((group) =>
                    group.children.length > 0 ? (
                      <optgroup key={group.name} label={group.name}>
                        {group.children.map((child) => <option key={child} value={child}>{child}</option>)}
                      </optgroup>
                    ) : (
                      <option key={group.name} value={group.name}>{group.name}</option>
                    ),
                  )}
                </select>
              </CardContent>
            </Card>
          ) : null}

          {notImported.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not saved ({notImported.length})</p>
              {notImported.map((item) => (
                <Card key={item.index} data-testid={`mpesa-skipped-${item.index}`}>
                  <CardContent className="p-4">
                    <p className="font-semibold text-foreground">
                      {item.receipt ? `${item.receipt}${item.amount ? ` · ${formatKes(item.amount)}` : ""}` : "A message"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.alreadyRecorded
                        ? item.alreadyRecorded.date
                          ? `Already recorded on ${item.alreadyRecorded.date}: ${item.alreadyRecorded.description}`
                          : item.alreadyRecorded.description
                        : item.reason}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          <div className="sticky bottom-4 space-y-2 rounded-2xl border border-border bg-card p-3 shadow-lg">
            {firstProblem ? <p className="text-sm text-destructive">{firstProblem}</p> : null}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setLines(null); setChoices({}); }}>Paste different messages</Button>
              <Button onClick={saveAll} disabled={saving || !summary || summary.count === 0} className="flex-1" data-testid="mpesa-import-save">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${summary?.count ?? 0} ${summary?.count === 1 ? "entry" : "entries"}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
