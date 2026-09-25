import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
import {
  useCreateDeposit,
  useCreateDisbursement,
  useGetSavingsGoals,
  useTransferBankToBank,
  useTransferBankToSavings,
  useTransferSavingsToBank,
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
  categoryPath,
  chooseCategory as chooseLineCategory,
  chooseIncomeSource,
  canUseSavings,
  chooseContribution,
  chooseSavings,
  chooseTransfer,
  destinationOf,
  isMove,
  throughMpesaHints,
  initialChoices,
  canReport,
  isRecordable,
  lineLabel,
  messageFor,
  categoryChanges,
  problemWith,
  recategorisable,
  reviewCounts,
  reviewStatus,
  type ReviewView,
  redactForReport,
  refreshSuggestions,
  snippetFor,
  summarise,
  type Choice,
  type PreviewLine,
} from "@/lib/mpesa-import";
import {
  balanceChanges,
  canLinkDebt,
  DEBT_LABEL,
  debtKindsFor,
  matchParty,
  suggestDebtKind,
  type DebtKind,
  type PartyLite,
} from "@/lib/mpesa-debts";
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

import { readStatementPages, StatementPasswordError } from "@/lib/statement-file";
import { rememberMpesaCard } from "@/lib/mpesa-card";
import { savePosting, type PostingApi } from "@/lib/save-posting";
import { parseStoredRules, payeeKey, payeeName, rulesStorageKey, withRule, withoutRule, type PayeeRules } from "@/lib/payee-learning";
import { reconcile, statementLines, type StatementReading } from "@/lib/statement-import";
import { checkRunningBalance, readStatementRows, resolveDirections } from "@/lib/statement-table";

/** A statement is kept this long, so it can be worked through over days. */
const STATEMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
  const queryClient = useQueryClient();
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
  const transferBankToBank = useTransferBankToBank();
  const transferBankToSavings = useTransferBankToSavings();
  const transferSavingsToBank = useTransferSavingsToBank();
  const { data: savingsGoalList = [] } = useGetSavingsGoals();
  const savingsGoals = savingsGoalList as unknown as Array<{ id: number; name: string; isCompleted?: boolean }>;

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  // M-Pesa is usually its own account: start on one that says so.
  const guessedAccount = accounts.find((account) => /m-?pesa/i.test(account.name))?.id ?? accounts[0]?.id ?? null;
  const accountId = selectedAccountId ?? guessedAccount;
  const { data: account } = useGetJointAccount(accountId ? { accountId } : undefined);
  const history = useMemo(
    () => (account?.transactions ?? []) as Array<{ type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null }>,
    [account],
  );
  // Where money in can be said to have come from: the person's own sources in a
  // Personal budget, everybody's in a shared group (each names its owner).
  const { data: incomeSources = [] } = useQuery<Array<{ id: number; name: string; userId?: string | null }>>({
    queryKey: ["income-sources", !isShared ? user?.id ?? "__me__" : "__group__"],
    queryFn: async () => {
      const url = !isShared && user?.id ? `/api/income-sources?userId=${encodeURIComponent(user.id)}` : "/api/income-sources";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 30_000,
  });

  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  // Categories chosen for entries already recorded, keyed by the line.
  const [recat, setRecat] = useState<Record<number, string>>({});
  const [recategorising, setRecategorising] = useState(false);
  // Which of the entries to show: all, or only those still to look at, changed by you, or needing you.
  const [view, setView] = useState<ReviewView>("all");
  const [chargeCategory, setChargeCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Names the person gave payees, kept in this browser for this budget.
  const [nicknames, setNicknames] = useState<NicknameMap>({});
  const [naming, setNaming] = useState<{ index: number; original: string; text: string } | null>(null);
  // What Jamvi was asked to remember: a payee's category, kept in this browser for this budget.
  const rulesKey = rulesStorageKey(group?.id);
  const [rules, setRules] = useState<PayeeRules>({});
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    try {
      setRules(parseStoredRules(window.localStorage.getItem(rulesKey)));
    } catch {
      setRules({});
    }
  }, [rulesKey]);
  const keepRules = (next: PayeeRules) => {
    setRules(next);
    try { window.localStorage.setItem(rulesKey, JSON.stringify(next)); } catch { /* kept only when storage allows */ }
  };

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
    setChoices((current) => refreshSuggestions(renamed, current, history, categories.map((row) => row.name), chargeCategory, rules));
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

  // A statement PDF: read on this device, with its password used only here.
  const statementInput = useRef<HTMLInputElement>(null);
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [statementPassword, setStatementPassword] = useState("");
  const [readingStatement, setReadingStatement] = useState(false);
  const [statementNote, setStatementNote] = useState<string | null>(null);
  const [statementReading, setStatementReading] = useState<StatementReading | null>(null);

  // Which of a statement's entries this budget already has: asked with the receipt codes only.
  const markRecorded = async (all: PreviewLine[]): Promise<PreviewLine[]> => {
    const codes = [...new Set(all.map((line) => line.receipt).filter((code): code is string => Boolean(code)))];
    if (codes.length === 0) return all;
    const response = await fetch("/api/mpesa/import/check-receipts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipts: codes }),
    });
    const body = (await response.json().catch(() => ({}))) as { recorded?: Array<{ receipt: string; date: string; description: string; category?: string | null; editable?: boolean }>; error?: string };
    if (!response.ok || !body.recorded) throw new Error(body.error ?? "Could not check what is already recorded.");
    const recorded = new Map(body.recorded.map((row) => [row.receipt, { date: row.date, description: row.description, category: row.category ?? null, editable: row.editable === true }]));
    return all.map((line) => {
      const existing = line.receipt ? recorded.get(line.receipt) : undefined;
      return existing ? { ...line, alreadyRecorded: existing } : line;
    });
  };

  const readStatement = async () => {
    if (!statementFile) return;
    setReadingStatement(true);
    try {
      const pages = await readStatementPages(statementFile, statementPassword);
      const rows = resolveDirections(readStatementRows(pages));
      if (rows.length === 0) throw new Error("Jamvi could not find the payments in this file. Is it the M-Pesa statement PDF?");
      const balance = checkRunningBalance(rows);
      if (!balance.ok) {
        throw new Error("This statement does not add up, so Jamvi will not risk recording wrong amounts. Paste your messages instead.");
      }
      const reading = statementLines(rows);
      const checked = await markRecorded(reading.lines);
      const shown = applyNicknames(checked, readStoredNicknames());
      const left = [
        reading.loanDraws > 0 ? `${reading.loanDraws} Fuliza loans` : null,
        reading.loanRepayments > 0 ? `${reading.loanRepayments} loan repayments` : null,
      ].filter(Boolean);
      setStatementNote(
        `Read ${shown.length} entries from your statement. It adds up.${left.length > 0 ? ` Left out because they are not spending or income: ${left.join(" and ")}. What a Fuliza loan paid for is recorded as a normal payment.` : ""}`,
      );
      setLines(shown);
      setStatementReading({ ...reading, lines: shown });
      setChoices(initialChoices(shown, history, categories.map((row) => row.name), chargeCategory, rules));
      setStatementPassword("");
    } catch (error) {
      if (error instanceof StatementPasswordError) {
        toast({
          variant: "destructive",
          title: error.wrong ? "Wrong password" : "Password needed",
          description: error.wrong ? "That did not open the statement. Try again." : "Type the password M-Pesa sent with the statement.",
        });
      } else {
        toast({ variant: "destructive", title: "Could not read the statement", description: error instanceof Error ? error.message : "Please try again." });
      }
    } finally {
      setReadingStatement(false);
    }
  };

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
      setChoices(initialChoices(shown, history, categories.map((row) => row.name), chargeCategory, rules));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not read them", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setReading(false);
    }
  };

  // A statement is worked through at the person's own pace: what is still to do is kept on
  // this device (never the PDF or its password) and picked up again where it was left.
  const statementDraftKey = `jamvi:mpesa-statement:${group?.id ?? "none"}`;
  const [draftChecked, setDraftChecked] = useState<string | null>(null);
  const statementLeft = (statementReading?.lines ?? []).filter(isRecordable).length;
  useEffect(() => {
    if (!group?.id || draftChecked === statementDraftKey) return;
    setDraftChecked(statementDraftKey);
    try {
      const raw = window.localStorage.getItem(statementDraftKey);
      const saved = raw ? (JSON.parse(raw) as { savedAt: number; reading: StatementReading; choices: Record<number, Choice>; accountId: number | null }) : null;
      if (!saved || !saved.reading?.lines || Date.now() - saved.savedAt > STATEMENT_DRAFT_MAX_AGE_MS) return;
      if (saved.accountId) setSelectedAccountId(saved.accountId);
      setStatementReading(saved.reading);
      setLines(saved.reading.lines);
      setChoices(saved.choices);
      setStatementNote("Picked up where you left off with your statement. Anything saved since is marked as recorded.");
      // Some may have been saved from another screen since: ask again which are recorded.
      markRecorded(saved.reading.lines)
        .then((checked) => {
          setLines(checked);
          setStatementReading((current) => (current ? { ...current, lines: checked } : current));
        })
        .catch(() => {});
    } catch {
      /* nothing kept, or storage not allowed: start fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);
  useEffect(() => {
    if (draftChecked !== statementDraftKey) return undefined;
    try {
      if (statementReading && statementLeft > 0) {
        const timer = window.setTimeout(() => {
          try {
            window.localStorage.setItem(statementDraftKey, JSON.stringify({ savedAt: Date.now(), reading: statementReading, choices, accountId: selectedAccountId }));
          } catch {
            /* kept only when storage allows */
          }
        }, 500);
        return () => window.clearTimeout(timer);
      }
      window.localStorage.removeItem(statementDraftKey);
    } catch {
      /* kept only when storage allows */
    }
    return undefined;
  }, [draftChecked, statementDraftKey, statementReading, statementLeft, choices, selectedAccountId]);

  // Would saving these leave the account moved as far as the statement says M-Pesa moved?
  const balanceCheck = useMemo(
    () => (statementReading && lines ? reconcile({ ...statementReading, lines }, (line) => choices[line.index]?.include === true) : null),
    [statementReading, lines, choices],
  );

  const summary = useMemo(() => (lines ? summarise(lines, choices) : null), [lines, choices]);
  // Which entry the red message is about, so clicking it can take you there.
  const firstProblemIndex = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) if (problemWith(item, choices[item.index])) return item.index;
    return null;
  }, [lines, choices]);
  const showProblem = () => {
    if (firstProblemIndex === null) return;
    // The entry may be hidden by a filter: show everything first, then go to it.
    setView("all");
    window.setTimeout(() => document.querySelector(`[data-testid="mpesa-line-${firstProblemIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const review = useMemo(() => (lines ? reviewCounts(lines, choices) : null), [lines, choices]);
  const firstProblem = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) {
      const problem = problemWith(item, choices[item.index]);
      if (problem) return `${lineLabel(item)}: ${problem}`;
    }
    if (summary && summary.fees > 0 && !chargeCategory.trim()) return "Choose a category for the M-Pesa charges.";
    return null;
  }, [lines, choices, summary, chargeCategory]);

  // Who owes who, and the categories that track a debt: a payment to or from a
  // person can be a debt or a loan, and paying a debt's category pays it down.
  const { data: parties = [] } = useQuery<PartyLite[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) return [];
      return (await response.json()) as PartyLite[];
    },
    staleTime: 30_000,
  });
  const debtCategories = useMemo(
    () =>
      (categoryList as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>)
        .filter((row) => row.debtBalance !== null && row.debtBalance !== undefined)
        .map((row) => ({ id: row.id, name: row.name, debtBalance: row.debtBalance })),
    [categoryList],
  );
  const [debtEditing, setDebtEditing] = useState<{ index: number; partyId: string; kind: DebtKind | "" } | null>(null);
  const setDebt = (index: number, debt: { kind: DebtKind; partyId: number } | null) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], debt } }));

  const transferHints = useMemo(() => throughMpesaHints(lines ?? []), [lines]);
  const otherAccounts = accounts.filter((option) => option.id !== accountId);
  const recordable = lines?.filter(isRecordable) ?? [];
  const notImported = lines?.filter((item) => !isRecordable(item)) ?? [];

  const setCategory = (index: number, category: string) =>
    setChoices((current) => chooseLineCategory(lines ?? [], current, index, category));

  // Changing the category of entries already recorded: nothing else about them is touched.
  const pendingChanges = useMemo(() => categoryChanges(lines ?? [], recat), [lines, recat]);
  const applyRecategorise = async () => {
    if (pendingChanges.length === 0 || recategorising) return;
    if (!window.confirm(`Change ${pendingChanges.length} ${pendingChanges.length === 1 ? "category" : "categories"}?\n\nOnly the category changes. Their amounts, dates and everything else stay as they are.`)) return;
    setRecategorising(true);
    try {
      const response = await fetch("/api/mpesa/import/recategorise", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: pendingChanges }),
      });
      const body = (await response.json().catch(() => ({}))) as { updated?: number; skipped?: string[]; error?: string };
      if (!response.ok || body.updated === undefined) throw new Error(body.error ?? "Could not change them.");
      const skipped = body.skipped ?? [];
      const done = new Set(pendingChanges.filter((change) => !skipped.includes(change.receipt)).map((change) => change.receipt));
      const next = (lines ?? []).map((item) =>
        item.receipt && done.has(item.receipt) && item.alreadyRecorded
          ? { ...item, alreadyRecorded: { ...item.alreadyRecorded, category: recat[item.index] } }
          : item,
      );
      setLines(next);
      setStatementReading((current) => (current ? { ...current, lines: next } : current));
      setRecat({});
      void queryClient.invalidateQueries();
      toast({
        title: `${body.updated} ${body.updated === 1 ? "category" : "categories"} changed`,
        description: skipped.length > 0 ? `${skipped.length} could not be changed (they are not plain spending).` : undefined,
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change them", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setRecategorising(false);
    }
  };

  // The calls that record things, handed to the one function that saves a line.
  const postingApi: PostingApi = {
    deposit: (data) => createDeposit.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    disbursement: (data) => createDisbursement.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    bankToBank: (data) => transferBankToBank.mutateAsync({ data: data as never }) as Promise<{ outgoing: { id: number }; incoming: { id: number } }>,
    toSavings: (data) => transferBankToSavings.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    fromSavings: (data) => transferSavingsToBank.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
  };

  const saveAll = async () => {
    if (!lines || !accountId || saving) return;
    if (firstProblem) {
      toast({ variant: "destructive", title: "Not quite ready", description: firstProblem });
      return;
    }
    setSaving(true);
    const result: Outcome = { saved: 0, repeats: 0, failed: [] };
    const savedIndexes = new Set<number>();
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
          incomeSources,
        });
        if (!built) continue;
        try {
          const posted = await savePosting(built, postingApi, accountId);
          if (posted.feeFailed) result.failed.push({ what: `${item.description} charge`, why: "The entry saved, but its charge did not." });
          result.saved += 1;
          savedIndexes.add(item.index);
        } catch (error) {
          const message = error instanceof Error ? error.message : "It was not saved.";
          if (/already recorded/i.test(message)) result.repeats += 1;
          else result.failed.push({ what: item.description ?? "A message", why: message });
        }
      }
    } finally {
      setSaving(false);
      if (statementReading) {
        const stamp = { date: todayIso(), description: "Saved from your statement" };
        const marked = lines.map((item) => (savedIndexes.has(item.index) ? { ...item, alreadyRecorded: stamp } : item));
        setLines(marked);
        setStatementReading((current) => (current ? { ...current, lines: marked } : current));
      }
      setOutcome(result);
      if (result.saved > 0) rememberMpesaCard("done");
    }
    {
      let kept = rules;
      for (const item of lines) {
        const choice = choices[item.index];
        if (savedIndexes.has(item.index) && choice?.remember && choice.category.trim() && item.description) {
          kept = withRule(kept, item.description, choice.category);
        }
      }
      if (kept !== rules) keepRules(kept);
    }
    void offerBalanceChanges(lines.filter((item) => savedIndexes.has(item.index)));
  };

  /**
   * Once, at the end, for everything that was saved. Asked and never applied by
   * itself: the entries can be edited or deleted afterwards, and a balance moved
   * behind somebody's back would be left quietly wrong.
   */
  const offerBalanceChanges = async (saved: PreviewLine[]) => {
    const changes = balanceChanges(saved, choices, parties, debtCategories);
    if (changes.length === 0) return;
    const question =
      `${changes.length === 1 ? "Update this balance too?" : `Update ${changes.length} balances too?`}\n\n` +
      `${changes.map((change) => `· ${change.label}`).join("\n")}\n\nThe entries are already saved either way.`;
    if (!window.confirm(question)) return;
    try {
      for (const change of changes) {
        const response = await fetch(change.endpoint, {
          method: change.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change.body),
        });
        if (!response.ok) throw new Error("A balance could not be updated.");
      }
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Some balances did not update", description: error instanceof Error ? error.message : "Please try again." });
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
        {statementReading && statementLeft > 0 ? (
          <p className="text-center text-sm text-muted-foreground" data-testid="mpesa-import-continue-later">
            {statementLeft} of your statement left. Keep going now, or come back later: the rest is kept on this device and is here when you open this page again.
          </p>
        ) : null}
        <div className="flex justify-center gap-3">
          {statementReading && statementLeft > 0 ? (
            <Button onClick={() => setOutcome(null)} data-testid="mpesa-import-keep-going">Keep going ({statementLeft} left)</Button>
          ) : null}
          <Link href="/bank"><Button variant={statementReading && statementLeft > 0 ? "outline" : "default"}>See my bank</Button></Link>
          <Button variant="outline" onClick={() => { setOutcome(null); setLines(null); setChoices({}); setText(""); setStatementNote(null); setStatementReading(null); }}>Paste more</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" data-testid="mpesa-import-page">
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What Jamvi remembers</DialogTitle>
            <DialogDescription>Categories you asked Jamvi to keep for a payee. Forget one and it goes back to being suggested from your history.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {Object.entries(rules).map(([key, category]) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                <span>{key} → {category}</span>
                <Button variant="ghost" size="sm" onClick={() => keepRules(withoutRule(rules, key))} aria-label={`Forget ${key}`} data-testid={`mpesa-rule-forget-${key}`}>Forget</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
        {/* Which budget these land in: the one switched to last, which may not be the one with the categories. */}
        <p className="mt-2 text-sm text-foreground" data-testid="mpesa-budget-row">
          These will be saved in <span className="font-semibold" data-testid="mpesa-budget-name">{group?.name ?? "…"}</span>. Use the budget switcher to change it.
        </p>
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

          <Card data-testid="mpesa-statement">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold text-foreground">Or use your M-Pesa statement</p>
              <p className="text-xs text-muted-foreground">
                Choose the statement PDF and type its password. Jamvi reads it here on your device. The file and the password are not uploaded or saved.
              </p>
              <input
                ref={statementInput}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => setStatementFile(event.target.files?.[0] ?? null)}
                data-testid="mpesa-statement-file"
              />
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => statementInput.current?.click()}>
                {statementFile ? statementFile.name.replace(/\d{6,}/g, "…") : "Choose the statement PDF"}
              </Button>
              <input
                type="password"
                value={statementPassword}
                onChange={(event) => setStatementPassword(event.target.value)}
                autoComplete="off"
                placeholder="Statement password"
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                data-testid="mpesa-statement-password"
              />
              <Button onClick={readStatement} disabled={!statementFile || readingStatement} className="h-12 w-full" data-testid="mpesa-statement-read">
                {readingStatement ? <Loader2 className="h-4 w-4 animate-spin" /> : "Read my statement"}
              </Button>
            </CardContent>
          </Card>
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
                setChoices(initialChoices(lines, [], categories.map((row) => row.name), chargeCategory, rules));
              }}
              data-testid="mpesa-import-account"
            >
              {accounts.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>

          {statementNote ? (
            <p className="rounded-xl border border-border bg-card p-3 text-sm text-foreground" data-testid="mpesa-statement-note">{statementNote}</p>
          ) : null}
          {balanceCheck ? (
            <Card data-testid="mpesa-statement-balance">
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="font-bold text-foreground">
                  {Math.abs(balanceCheck.gap) < 0.005 ? "Matches your statement" : "Will not match your statement exactly"}
                </p>
                <p className="text-muted-foreground">
                  Your statement went from {formatKes(balanceCheck.opening)} to {formatKes(balanceCheck.closing)}, a change of {formatKes(balanceCheck.statementChange)}.
                  Saving these moves this account by {formatKes(balanceCheck.savedChange)}.
                  {balanceCheck.alreadyRecordedChange !== 0 ? ` Entries already recorded account for ${formatKes(balanceCheck.alreadyRecordedChange)}.` : ""}
                </p>
                {Math.abs(balanceCheck.gap) >= 0.005 ? (
                  <>
                    <p className="text-foreground">The difference of {formatKes(balanceCheck.gap)} is:</p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {balanceCheck.parts.map((part) => (
                        <li key={part.label}>{part.label}: {formatKes(part.amount)}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="text-xs text-muted-foreground">Your account also has to start at {formatKes(balanceCheck.opening)} for it to end at {formatKes(balanceCheck.closing)}.</p>
              </CardContent>
            </Card>
          ) : null}
          {summary ? (
            <Card data-testid="mpesa-import-summary">
              <CardContent className="p-4">
                <p className="font-bold text-foreground">{summary.count} of {recordable.length} ready to save</p>
                <p className="text-sm text-muted-foreground">
                  Money in {formatKes(summary.moneyIn)} · money out {formatKes(summary.moneyOut)}
                  {summary.fees > 0 ? ` · M-Pesa charges ${formatKes(summary.fees)}` : ""}
                  {summary.moves > 0 ? ` · ${summary.moves} between your own accounts` : ""}
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

          {Object.keys(rules).length > 0 ? (
            <button type="button" onClick={() => setRulesOpen(true)} className="text-left text-sm font-semibold text-primary" data-testid="mpesa-rules-open">
              What Jamvi remembers ({Object.keys(rules).length})
            </button>
          ) : null}
          {review && review.all > 0 ? (
            <Card data-testid="mpesa-review">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm text-foreground" data-testid="mpesa-review-counts">
                  {review.changed} changed by you · {review.suggested} still Jamvi's suggestion{review.needs > 0 ? ` · ${review.needs} need${review.needs === 1 ? "s" : ""} you` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "All"],
                    ["needs", "Needs you"],
                    ["changed", "Changed by you"],
                    ["suggested", "Suggested"],
                  ] as Array<[ReviewView, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setView(key)}
                      aria-pressed={view === key}
                      data-testid={`mpesa-review-${key}`}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${view === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-foreground"}`}
                    >
                      {label} ({review[key]})
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {recordable.filter((item) => view === "all" || reviewStatus(item, choices[item.index]) === view).map((item) => {
            const choice = choices[item.index];
            const out = item.direction === "out";
            const status = reviewStatus(item, choice);
            return (
              <Card key={item.index} className={choice?.include ? "" : "opacity-55"} data-testid={`mpesa-line-${item.index}`}>
                <CardContent className="space-y-3 p-4">
                  {status ? (
                    <p
                      className={`text-xs font-semibold ${status === "needs" ? "text-destructive" : status === "changed" ? "text-primary" : "text-muted-foreground"}`}
                      data-testid={`mpesa-line-status-${item.index}`}
                    >
                      {status === "needs" ? "Needs you" : status === "changed" ? "You changed this" : "Suggested by Jamvi"}
                    </p>
                  ) : null}
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
                  {out && choice?.include && choice.debt?.kind !== "lend" && !isMove(choice) ? (
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
                  {out && choice?.include && !isMove(choice) && choice.category && categoryPath(choice.category, categories) !== choice.category ? (
                    <p className="text-xs text-muted-foreground" data-testid={`mpesa-line-path-${item.index}`}>
                      Filed under {categoryPath(choice.category, categories)}
                    </p>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.category && item.description && rules[payeeKey(item.description)] !== choice.category ? (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={choice.remember === true}
                        onChange={(event) => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], remember: event.target.checked } }))}
                        data-testid={`mpesa-line-remember-${item.index}`}
                      />
                      Remember {choice.category} for {payeeName(item.description)}
                    </label>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.auto && choice.category ? (
                    <p className="text-xs text-muted-foreground" data-testid={`mpesa-line-suggested-${item.index}`}>
                      Suggested by Jamvi. Change it if it is wrong.
                    </p>
                  ) : null}
                  {item.direction === "in" && choice?.include && !choice.debt && !isMove(choice) && !choice.contributorId && incomeSources.length > 0 ? (
                    <div className="space-y-1" data-testid={`mpesa-line-source-${item.index}`}>
                      <select
                        className={SELECT_CLASS}
                        value={choice.incomeSourceId ?? ""}
                        onChange={(event) =>
                          setChoices((current) => chooseIncomeSource(lines ?? [], current, item.index, event.target.value ? Number(event.target.value) : null))
                        }
                        aria-label="Where did this come from?"
                        data-testid={`mpesa-line-source-select-${item.index}`}
                      >
                        <option value="">Where did this come from? (optional)</option>
                        {incomeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                      </select>
                      {choice.sourceAuto && choice.incomeSourceId ? (
                        <p className="text-xs text-muted-foreground" data-testid={`mpesa-line-source-suggested-${item.index}`}>
                          Suggested by Jamvi. Change it if it is wrong.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {choice?.include && !choice.debt && !choice.contributorId && otherAccounts.length > 0 ? (
                    <div className="space-y-1" data-testid={`mpesa-line-move-${item.index}`}>
                      <p className={`text-xs ${transferHints.has(item.index) ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                        {transferHints.has(item.index)
                          ? "Looks like money passing through M-Pesa between your own accounts. Is it?"
                          : "Is this money moving between your own accounts?"}
                      </p>
                      <select
                        className={SELECT_CLASS}
                        value={choice.transferTo ?? ""}
                        onChange={(event) => setChoices((current) => chooseTransfer(current, item.index, event.target.value ? Number(event.target.value) : null))}
                        aria-label="Move between my own accounts"
                        data-testid={`mpesa-line-move-select-${item.index}`}
                      >
                        <option value="">No</option>
                        {otherAccounts.map((option) => (
                          <option key={option.id} value={option.id}>{out ? "To" : "From"} {option.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {choice?.include && destinationOf(choice) !== "debt" && destinationOf(choice) !== "contribution" && canUseSavings(item) && savingsGoals.length > 0 ? (
                    <div className="space-y-1" data-testid={`mpesa-line-savings-${item.index}`}>
                      <p className="text-xs text-muted-foreground">{out ? "Is this going into savings?" : "Is this coming out of savings?"}</p>
                      <select
                        className={SELECT_CLASS}
                        value={choice.savingsGoalId ?? ""}
                        onChange={(event) => setChoices((current) => chooseSavings(current, item.index, event.target.value ? Number(event.target.value) : null))}
                        aria-label="Savings goal"
                        data-testid={`mpesa-line-savings-select-${item.index}`}
                      >
                        <option value="">No</option>
                        {savingsGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {isShared && item.direction === "in" && choice?.include && !isMove(choice) && destinationOf(choice) !== "debt" && parties.length > 0 ? (
                    <div className="space-y-1" data-testid={`mpesa-line-contribution-${item.index}`}>
                      <p className="text-xs text-muted-foreground">Is this a member's contribution? Whose?</p>
                      <select
                        className={SELECT_CLASS}
                        value={choice.contributorId ?? ""}
                        onChange={(event) => setChoices((current) => chooseContribution(current, item.index, event.target.value ? Number(event.target.value) : null))}
                        aria-label="Whose contribution"
                        data-testid={`mpesa-line-contribution-select-${item.index}`}
                      >
                        <option value="">No</option>
                        {parties.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {choice?.include && !isMove(choice) && item.type === "bank_receipt" && parties.length === 0 ? (
                    <Link href="/parties" className="block text-xs font-semibold text-primary" data-testid={`mpesa-line-add-business-${item.index}`}>
                      Money to or from a company you own? Add it in Who owes who, then come back and choose it here.
                    </Link>
                  ) : null}
                  {choice?.include && !isMove(choice) && !choice.contributorId && canLinkDebt(item, parties) && parties.length > 0 ? (
                    (() => {
                      const linked = choice.debt ? parties.find((party) => party.id === choice.debt!.partyId) : undefined;
                      const guess = !choice.debt && item.direction ? matchParty(item.original ?? item.description, parties) : null;
                      const guessKind = guess && item.direction ? suggestDebtKind(item.direction, guess) : null;
                      if (debtEditing?.index === item.index) {
                        return (
                          <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`mpesa-debt-editor-${item.index}`}>
                            <select
                              className={SELECT_CLASS}
                              value={debtEditing.partyId}
                              onChange={(event) => setDebtEditing({ ...debtEditing, partyId: event.target.value })}
                              aria-label="Who is it?"
                              data-testid={`mpesa-debt-party-${item.index}`}
                            >
                              <option value="">Who is it?</option>
                              {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                            </select>
                            <select
                              className={SELECT_CLASS}
                              value={debtEditing.kind}
                              onChange={(event) => setDebtEditing({ ...debtEditing, kind: event.target.value as DebtKind })}
                              aria-label="What is it?"
                              data-testid={`mpesa-debt-kind-${item.index}`}
                            >
                              <option value="">What is it?</option>
                              {item.direction ? debtKindsFor(item.direction).map((kind) => <option key={kind} value={kind}>{DEBT_LABEL[kind]}</option>) : null}
                            </select>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={!debtEditing.partyId || !debtEditing.kind}
                                onClick={() => {
                                  if (debtEditing.partyId && debtEditing.kind) setDebt(item.index, { kind: debtEditing.kind, partyId: Number(debtEditing.partyId) });
                                  setDebtEditing(null);
                                }}
                                data-testid={`mpesa-debt-save-${item.index}`}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setDebt(item.index, null); setDebtEditing(null); }}>No, it is not a debt or loan</Button>
                              <Button size="sm" variant="outline" onClick={() => setDebtEditing(null)}>Cancel</Button>
                            </div>
                          </div>
                        );
                      }
                      if (choice.debt && linked) {
                        return (
                          <button
                            type="button"
                            onClick={() => setDebtEditing({ index: item.index, partyId: String(linked.id), kind: choice.debt!.kind })}
                            className="text-left text-xs font-semibold text-primary hover:underline"
                            data-testid={`mpesa-line-debt-${item.index}`}
                          >
                            {DEBT_LABEL[choice.debt.kind]}: {linked.name} · change
                          </button>
                        );
                      }
                      if (guess && guessKind) {
                        return (
                          <button
                            type="button"
                            onClick={() => setDebt(item.index, { kind: guessKind, partyId: guess.id })}
                            className="text-left text-xs font-semibold text-primary hover:underline"
                            data-testid={`mpesa-line-debt-guess-${item.index}`}
                          >
                            Looks like {guess.name}. {DEBT_LABEL[guessKind]}? Click to set
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => setDebtEditing({ index: item.index, partyId: guess ? String(guess.id) : "", kind: "" })}
                          className="text-left text-xs font-semibold text-primary hover:underline"
                          data-testid={`mpesa-line-debt-open-${item.index}`}
                        >
                          Is this a debt or loan?
                        </button>
                      );
                    })()
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
                    {item.alreadyRecorded?.editable && item.direction === "out" ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">Now in: {item.alreadyRecorded.category || "no category"}</p>
                        <select
                          className={SELECT_CLASS}
                          value={recat[item.index] ?? ""}
                          onChange={(event) => setRecat((current) => ({ ...current, [item.index]: event.target.value }))}
                          aria-label={`Change the category of ${item.receipt}`}
                          data-testid={`mpesa-recat-${item.index}`}
                        >
                          <option value="">Change its category</option>
                          {categories.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
                        </select>
                      </div>
                    ) : null}
                    {reportLink(item)}
                  </CardContent>
                </Card>
              ))}
              {pendingChanges.length > 0 ? (
                <Button onClick={applyRecategorise} disabled={recategorising} className="h-12 w-full" data-testid="mpesa-recat-apply">
                  {recategorising ? <Loader2 className="h-4 w-4 animate-spin" /> : `Change ${pendingChanges.length} ${pendingChanges.length === 1 ? "category" : "categories"}`}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="sticky bottom-4 space-y-2 rounded-2xl border border-border bg-card p-3 shadow-lg">
            {firstProblem ? (
              <button type="button" onClick={showProblem} className="block w-full text-left text-sm text-destructive" data-testid="mpesa-first-problem">
                {firstProblem}
                {firstProblemIndex !== null ? " Click to see it." : ""}
              </button>
            ) : null}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setLines(null); setChoices({}); setStatementNote(null); setStatementReading(null); }}>Start again</Button>
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
