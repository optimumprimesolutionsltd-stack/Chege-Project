import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategorySearchInput, useCategorySearch } from "@/components/category-search";
import { formatKes } from "@/lib/utils";
import {
  buildPostings,
  chooseCategory as chooseLineCategory,
  initialChoices,
  canReport,
  isRecordable,
  lineLabel,
  messageFor,
  problemWith,
  redactForReport,
  refreshSuggestions,
  snippetFor,
  summarise,
  type Choice,
  type PreviewLine,
} from "@/lib/mpesa-import";
import {
  applyNicknames,
  canNickname,
  nicknameStorageKey,
  parseStoredNicknames,
  withNickname,
  type NicknameMap,
} from "@/lib/payee-nicknames";

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
  const { data: categoryList = [], isLoading: categoriesLoading, isError: categoriesError, refetch: refetchCategories } = useGetBudgetCategories();
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
  // Names the person gave payees, kept in this browser for this budget.
  const [nicknames, setNicknames] = useState<NicknameMap>({});
  const [naming, setNaming] = useState<{ index: number; original: string; text: string } | null>(null);
  const nicknamesKey = nicknameStorageKey(group?.id);
  const readStoredNicknames = (): NicknameMap => {
    try {
      return parseStoredNicknames(window.localStorage.getItem(nicknamesKey));
    } catch {
      return {};
    }
  };
  useEffect(() => {
    setNicknames(readStoredNicknames());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nicknamesKey]);

  const saveNickname = () => {
    if (!naming || !lines) return;
    const next = withNickname(nicknames, naming.original, naming.text);
    setNicknames(next);
    try { window.localStorage.setItem(nicknamesKey, JSON.stringify(next)); } catch { /* remembered only when storage allows */ }
    const renamed = applyNicknames(lines, next);
    setLines(renamed);
    setChoices((current) => refreshSuggestions(renamed, current, history, categories.map((row) => row.name), chargeCategory));
    setNaming(null);
  };

  // Sending a message Jamvi could not read, so its format can be learned.
  const [reporting, setReporting] = useState<{ index: number; text: string } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reported, setReported] = useState<Set<number>>(new Set());

  const openReport = (index: number) => {
    const message = messageFor(text, index);
    if (message) setReporting({ index, text: redactForReport(message) });
  };

  const sendReport = async () => {
    if (!reporting || sendingReport) return;
    setSendingReport(true);
    try {
      const response = await fetch("/api/mpesa/report-format", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reporting.text }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not send it right now.");
      }
      setReported((current) => new Set(current).add(reporting.index));
      setReporting(null);
      toast({ title: "Thank you", description: "Jamvi will learn this kind of message." });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not send it", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSendingReport(false);
    }
  };

  const reportLink = (item: PreviewLine) => {
    if (!canReport(item)) return null;
    return reported.has(item.index) ? (
      <p className="text-xs text-success">Sent. Thank you.</p>
    ) : (
      <button
        type="button"
        onClick={() => openReport(item.index)}
        className="text-xs font-semibold text-primary hover:underline"
        data-testid={`mpesa-report-${item.index}`}
      >
        Send this message so Jamvi can learn it
      </button>
    );
  };

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
      const shown = applyNicknames(body.lines, readStoredNicknames());
      setLines(shown);
      setChoices(initialChoices(shown, history, categories.map((row) => row.name), chargeCategory));
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
    setChoices((current) => chooseLineCategory(lines ?? [], current, index, category));

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
      <Dialog open={naming !== null} onOpenChange={(open) => !open && setNaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What do you call this?</DialogTitle>
            <DialogDescription>
              Jamvi read: {naming?.original}. Give it a name that makes sense to you, and Jamvi will use it every time.
            </DialogDescription>
          </DialogHeader>
          <input
            value={naming?.text ?? ""}
            onChange={(event) => setNaming((current) => (current ? { ...current, text: event.target.value } : current))}
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
            data-testid="mpesa-nickname-text"
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setNaming((current) => (current ? { ...current, text: current.original } : current))}>
              Use the name Jamvi read
            </Button>
            <Button variant="outline" onClick={() => setNaming(null)}>Cancel</Button>
            <Button onClick={saveNickname} data-testid="mpesa-nickname-save">Save name</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reporting !== null} onOpenChange={(open) => !open && setReporting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this message</DialogTitle>
            <DialogDescription>
              This goes to the Jamvi team so we can teach the app this kind of message. It is not linked to you, and phone
              numbers are hidden. Black out any names or other details you would rather not share, then send.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={reporting?.text ?? ""}
            onChange={(event) => setReporting((current) => (current ? { ...current, text: event.target.value } : current))}
            rows={7}
            className="w-full rounded-xl border border-input bg-card p-3 text-sm"
            data-testid="mpesa-report-text"
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setReporting(null)}>Cancel</Button>
            <Button onClick={sendReport} disabled={sendingReport || !reporting?.text.trim()} data-testid="mpesa-report-send">
              {sendingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                setChoices(initialChoices(lines, [], categories.map((row) => row.name), chargeCategory));
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

          {/* A payment needs a category, so say plainly when there are none to choose from. */}
          {categories.length === 0 ? (
            <Card data-testid="mpesa-no-categories">
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="font-semibold text-foreground">
                  {categoriesLoading
                    ? "Loading your categories…"
                    : categoriesError
                      ? "Could not load your categories."
                      : `${group?.name ? `“${group.name}”` : "This budget"} has no categories yet.`}
                </p>
                {categoriesError ? (
                  <Button size="sm" variant="outline" onClick={() => void refetchCategories()}>Try again</Button>
                ) : !categoriesLoading ? (
                  <p className="text-muted-foreground">
                    Payments need one to be saved under. <Link href="/budget" className="font-semibold text-primary underline">Add categories in Budget</Link>, then paste again.
                  </p>
                ) : null}
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
                      {canNickname(item) ? (
                        <button
                          type="button"
                          onClick={() => setNaming({ index: item.index, original: item.original ?? item.description ?? "", text: item.description ?? "" })}
                          className="flex max-w-full items-center gap-1.5 text-left font-semibold text-foreground hover:underline"
                          aria-label={`${item.description}. Rename this payee`}
                          data-testid={`mpesa-line-name-${item.index}`}
                        >
                          <span className="truncate">{item.description}</span>
                          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </button>
                      ) : (
                        <p className="truncate font-semibold text-foreground">{item.description}</p>
                      )}
                      {item.original && item.original !== item.description ? (
                        <p className="text-xs text-muted-foreground">Jamvi read: {item.original}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{item.date ?? "No date on it, so today"} · {out ? "Money out" : "Money in"}</p>
                      {item.named === false && snippetFor(text, item.receipt) ? (
                        <p className="text-xs italic text-muted-foreground" data-testid={`mpesa-line-snippet-${item.index}`}>
                          No name in the message: “{snippetFor(text, item.receipt)}…”
                        </p>
                      ) : null}
                      {reportLink(item)}
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
                  {out && choice?.include && choice.auto && choice.category ? (
                    <p className="text-xs text-muted-foreground" data-testid={`mpesa-line-suggested-${item.index}`}>
                      Suggested by Jamvi. Change it if it is wrong.
                    </p>
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
                    {reportLink(item)}
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
