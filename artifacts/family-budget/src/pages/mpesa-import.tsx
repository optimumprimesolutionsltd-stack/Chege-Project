import { clearSavePending, hasPendingSave, markSavePending } from "@/lib/import-save-job";
import { Input } from "@/components/ui/input";
import { CategoryGroupPicker, resolveGroupChoice, type GroupChoice } from "@/components/category-group-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Loader2, Lock, Pencil, RotateCcw } from "lucide-react";
import {
  createDeposit as createDepositInOtherBudget,
  createDisbursement as createDisbursementInOtherBudget,
  useCreateDeposit,
  useCreateDisbursement,
  useGetSavingsGoals,
  useTransferBankToBank,
  useTransferBankToSavings,
  useTransferSavingsToBank,
  useGetBudgetCategories,
  useCreateBudgetCategory,
  getGetBudgetCategoriesQueryKey,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
  useGetMembers,
  useGetWorkspaces,
  type Workspace,
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
  chooseOtherBudget,
  sendableLines,
  sendLinesToOtherBudget,
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
  carryChoices,
  isConfirmedToSave,
  confirmableLines,
  categorisableLines,
  confirmLines,
  categoriseLines,
  lineMatches,
  monthsOf,
  inMonth,
  streamableLines,
  streamLines,
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
import { findFulizaParty, FULIZA_PARTY_NAME, needsFulizaParty, withFulizaDebt } from "@/lib/mpesa-debts";
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

// The category list's "+ Add a category..." entry: opens the form, never a category.
const ADD_CATEGORY = "__add_category__";
// Entries drawn at a time on the review (see shownCount).
/** The web's "Not sure" in the income source picker: the blank option cannot be chosen as an answer. */
const NOT_SURE_SOURCE = "__not_sure";
const LINES_PER_PAGE = 100;
const todayIso = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

/** `lapsed`: the trial or subscription had ended, so the save stopped; `waiting` were left unsaved. */
type Outcome = { saved: number; repeats: number; failed: Array<{ what: string; why: string }>; lapsed?: { waiting: number } };

import { readStatementPages, StatementPasswordError } from "@/lib/statement-file";
import { rememberMpesaCard } from "@/lib/mpesa-card";
import { keepScreenAwakeWhileSaving, letScreenSleepAgain } from "@/lib/keep-awake";
import { runPool, savePosting, SAVE_CONCURRENCY, type PostingApi } from "@/lib/save-posting";
import { parseStoredRules, payeeKey, payeeName, ruleLabel, rulesStorageKey, withRule, withoutRule, type PayeeRules } from "@/lib/payee-learning";
import { applyOtherBudgetRules, otherBudgetRuleFor, otherBudgetRuleLabel, otherBudgetRulesKey, parseOtherBudgetRules, rememberOtherBudgetLabel, withOtherBudgetRule, withoutOtherBudgetRule, type OtherBudgetRules } from "@/lib/other-budget-rules";
import { saveDebtLinks } from "@/lib/debt-reversal";
import { mpesaNameFor, saveMpesaNames, type MpesaName } from "@/lib/mpesa-names";
import { isLapsedRefusal, lapsedSaveMessage } from "@/lib/lapsed-save";
import { useUndoHistory } from "@/hooks/use-undo-history";
import { plainSaveError, retrySave, withRetries } from "@/lib/save-retry";
import { isNotSure, needsNotSureCategory, NOT_SURE_CATEGORY, notSureableLines, otherBudgetToMark, putUnderNotSure, toMarkAfterSave } from "@/lib/entries-to-sort";
import { useEntitlements } from "@/hooks/use-entitlements";
import type { DebtEntryLink } from "@/lib/debt-links";
import { balanceAtEndOf, dayBefore, fulizaOwedBefore, missingInJamvi, notOnStatement, reconcile, statementLines, withoutRecordedFuliza, type RecordedRow, type StatementReading } from "@/lib/statement-import";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { deletedLabel } from "@/lib/undo-delete";
import { checkRunningBalance, readStatementRows, resolveDirections } from "@/lib/statement-table";
import { fetchOtherBudgetOptions, type OtherBudgetOptions } from "@/lib/other-budget-options";

/** A statement is kept this long, so it can be worked through over days. */
const STATEMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const SELECT_CLASS = "flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm";

// The server checks and changes at most 2,000 receipts per request.
const RECEIPT_BATCH = 1_000;

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
  // In a shared group only an owner or admin can record payments out, moves between accounts and savings.
  const canManageBudget = !isShared || group?.role === "owner" || group?.role === "admin";

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Array<{ id: number; name: string }>;
  const { data: categoryList = [], isLoading: categoriesLoading, isError: categoriesError, refetch: refetchCategories } = useGetBudgetCategories();
  const categories = categoryList as unknown as CategoryRow[];
  // "+ Add a category..." on an entry: a category made here, with its budget
  // and group, and set on that entry. The phone has had this all along.
  const createCategory = useCreateBudgetCategory();
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");
  const [newCategoryGroup, setNewCategoryGroup] = useState<GroupChoice>("none");
  const [newCategoryGroupName, setNewCategoryGroupName] = useState("");
  const closeAddCategory = () => {
    setAddingFor(null);
    setNewCategoryName("");
    setNewCategoryBudget("");
    setNewCategoryGroup("none");
    setNewCategoryGroupName("");
  };
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
    () => (account?.transactions ?? []) as Array<{ type: string; description: string; expenseCategory?: string | null; incomeSourceId?: number | null; chargeForTransactionId?: number | null }>,
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
  // A source can outlive the member it once belonged to (removed from the
  // budget, or a data problem never quite cleaned up) - checked against this
  // so a deposit still saves, attributed to whoever is doing the import now,
  // instead of failing outright over an attribution nobody asked for.
  const { data: members = [] } = useGetMembers();
  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);

  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  // Undo for every change to the list, most recent first - as on the phone.
  // Cleared for a new list or after a save; a save itself is not undone here.
  const { canUndo, steps: undoSteps, undo } = useUndoHistory(choices, setChoices, lines, {
    skip: (previous) => Object.keys(previous).length === 0,
  });
  // Categories chosen for entries already recorded, keyed by the line.
  const [recat, setRecat] = useState<Record<number, string>>({});
  const [recategorising, setRecategorising] = useState(false);
  // Which of the entries to show: all, or only those still to look at, changed by you, or needing you.
  const [view, setView] = useState<ReviewView>("all");
  // Search over the review ("bundle", "KPLC", a till, a category): what is
  // found can be confirmed, or given one category, all together.
  const [find, setFind] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  // A full statement is thousands of entries: drawn a page at a time.
  const [shownCount, setShownCount] = useState(LINES_PER_PAGE);
  // Reading the same statement again shows the picker without clearing the
  // work in progress or its copy in this browser; the new reading keeps every
  // choice (carryChoices).
  const [rereading, setRereading] = useState(false);
  const [chargeCategory, setChargeCategory] = useState("");
  // Charges go to the budget's built-in M-Pesa charges whenever it has one; the
  // category last picked for charges (remembered across budgets) only stands
  // in where it has none - it used to file every charge under School fees.
  const builtInCharge = categories.find((row) => row.name.trim().toLowerCase() === "m-pesa charges")?.name ?? null;
  const effectiveChargeCategory = builtInCharge ?? chargeCategory;
  const [saving, setSaving] = useState(false);
  // How far a save has got, so two hundred entries travelling to the server together does
  // not just sit behind a spinner with no sign of life.
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // How the last save of part of a statement went, shown on the review itself:
  // the whole-page result is only for when nothing is left to save (as on the phone).
  const [lastSave, setLastSave] = useState<Outcome | null>(null);
  // A save cut short (the tab closed part way) is finished when the import opens again.
  const [resumeSave, setResumeSave] = useState(false);
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
  // Payees remembered as another budget's - the chama's paybill, say - kept the
  // same way, so the next statement suggests that budget for them.
  const otherRulesKey = otherBudgetRulesKey(group?.id);
  const [otherRules, setOtherRules] = useState<OtherBudgetRules>({});
  useEffect(() => {
    try {
      setOtherRules(parseOtherBudgetRules(window.localStorage.getItem(otherRulesKey)));
    } catch {
      setOtherRules({});
    }
  }, [otherRulesKey]);
  const keepOtherRules = (next: OtherBudgetRules) => {
    setOtherRules(next);
    try { window.localStorage.setItem(otherRulesKey, JSON.stringify(next)); } catch { /* kept only when storage allows */ }
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
    setChoices((current) => refreshSuggestions(renamed, current, history, categories.map((row) => row.name), effectiveChargeCategory, rules));
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
    // A year's statement holds thousands of codes; the server takes 2,000 at a time.
    const body: { recorded: Array<{ receipt: string; date: string; description: string; category?: string | null; editable?: boolean }> } = { recorded: [] };
    for (let start = 0; start < codes.length; start += RECEIPT_BATCH) {
      const response = await fetch("/api/mpesa/import/check-receipts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipts: codes.slice(start, start + RECEIPT_BATCH) }),
      });
      const part = (await response.json().catch(() => ({}))) as { recorded?: typeof body.recorded; error?: string };
      if (!response.ok || !part.recorded) throw new Error(part.error ?? "Could not check what is already recorded.");
      body.recorded.push(...part.recorded);
    }
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
      // Fuliza an earlier statement left owed is repaid first in this one, not charged as fees.
      const recordedRows = (account?.transactions ?? []) as Array<{ mpesaReceipt?: string | null; amount?: number | string | null }>;
      // Less what an overlapping statement already recorded of its Fuliza lines.
      const reading = withoutRecordedFuliza(
        statementLines(rows, fulizaOwedBefore(statementLines(rows).firstDate, recordedRows)),
        recordedRows as unknown as RecordedRow[],
      );
      const checked = await markRecorded(reading.lines);
      const shown = applyNicknames(checked, readStoredNicknames());
      const left = [
        reading.loanDraws > 0 ? `${reading.loanDraws} Fuliza loans` : null,
        reading.loanRepayments > 0 ? `${reading.loanRepayments} loan repayments` : null,
      ].filter(Boolean);
      setStatementNote(
        `Read ${shown.length} entries from your statement. It adds up.${left.length > 0 ? ` Left out because they are not spending or income: ${left.join(" and ")}. What a Fuliza loan paid for is recorded as a normal payment${reading.loanOwedAtEnd ? ", and Fuliza still owed at the end is listed as borrowed" : ""}.` : ""}`,
      );
      const fresh = initialChoices(shown, history, categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget);
      // Reading the same statement again keeps what was already worked through.
      const built = lines ? carryChoices(lines, choices, shown, fresh) : fresh;
      setLines(shown);
      setStatementReading({ ...reading, lines: shown });
      setChoices(built);
      setRereading(false);
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
      setChoices(initialChoices(shown, history, categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget));
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
          if (hasPendingSave(group?.id)) {
            setStatementNote("Carrying on with the save you started. Entries already saved are skipped.");
            setResumeSave(true);
          }
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

  // ── Comparing with the statement, and sorting each difference out where it
  // is shown - the phone's (app/mpesa-import.tsx), brought to the web 3 Oct 2026.
  type AccountRows = Array<{ id: number; date: string; type: string; amount: number; mpesaReceipt?: string | null }>;
  const accountRows = (account?.transactions ?? []) as unknown as AccountRows;
  const accountOpening = Number((account as { openingBalance?: number | null } | undefined)?.openingBalance ?? 0);
  // Setting the account's opening balance to the statement's, when nothing is
  // recorded in it before the statement starts - the one case where that is
  // certainly right. Anything recorded earlier and the difference is only shown.
  const [openingSaving, setOpeningSaving] = useState(false);
  const openingFix = useMemo(() => {
    const first = statementReading?.firstDate;
    const opening = statementReading?.opening;
    if (!first || opening == null || !account || !accountId) return null;
    if (accountRows.some((row) => String(row.date).slice(0, 10) < first)) return null;
    if (Math.abs(accountOpening - opening) < 0.005) return null;
    return { current: accountOpening, to: opening, date: dayBefore(first) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementReading, account, accountId]);
  const fixOpeningBalance = async () => {
    if (!openingFix || !accountId || openingSaving) return;
    setOpeningSaving(true);
    try {
      const response = await fetch("/api/joint-account/opening-balance", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: openingFix.to, openingBalanceDate: openingFix.date, accountId }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Please try again.");
      await queryClient.invalidateQueries();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not set the opening balance", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setOpeningSaving(false);
    }
  };
  // Jamvi's own balance the day before the statement starts and on its last
  // day, beside M-Pesa's. A difference at the start is from before the statement.
  const balanceSides = useMemo(() => {
    const first = statementReading?.firstDate;
    const last = statementReading?.lastDate;
    if (!first || !last || statementReading?.opening == null || statementReading?.closing == null || !account) return null;
    const startDay = dayBefore(first);
    return {
      startDay,
      jamviStart: balanceAtEndOf(startDay, accountOpening, accountRows),
      mpesaStart: statementReading.opening,
      endDay: last,
      jamviEnd: balanceAtEndOf(last, accountOpening, accountRows),
      mpesaEnd: statementReading.closing,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementReading, account]);
  const statementUndo = useUndoableDelete();
  const sendJson = async (url: string, method: string, body?: unknown) => {
    const response = await fetch(url, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Please try again.");
  };
  // What this account has for the statement's days that the statement does not.
  const extras = useMemo(() => {
    const found = statementReading && account ? notOnStatement(statementReading, accountRows as unknown as RecordedRow[]) : null;
    if (!found) return null;
    const rows = found.rows.filter((row) => !statementUndo.isHidden(`extra:${row.id}`));
    return { rows, net: Math.round(rows.reduce((sum, row) => sum + row.effect, 0) * 100) / 100 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementReading, account, statementUndo.isHidden]);
  const removeExtra = (row: { id: number; date: string; description?: string | null; effect: number; why: string }) => {
    if (!window.confirm(`Remove it from Jamvi?\n\n${String(row.date).slice(0, 10)} · ${row.description ?? ""} · ${formatKes(Math.abs(row.effect))}\n\nYour M-Pesa statement has no record of it (${row.why}). Remove it if it did not happen, or was recorded twice.`)) return;
    statementUndo.schedule(`extra:${row.id}`, deletedLabel(row.description, Math.abs(row.effect)), async () => {
      try {
        await sendJson(`/api/joint-account/${row.id}`, "DELETE");
      } catch (error) {
        toast({ variant: "destructive", title: "Could not remove it", description: error instanceof Error ? error.message : "Please try again." });
      }
      await queryClient.invalidateQueries();
    });
  };
  // "Fix these for me": the entries the check can prove are duplicates.
  const [fixingExtras, setFixingExtras] = useState(false);
  const fixableExtras = (extras?.rows ?? []).filter((row) => row.fixable);
  const fixExtras = async () => {
    if (fixableExtras.length === 0 || fixingExtras) return;
    const total = Math.round(fixableExtras.reduce((sum, row) => sum + row.effect, 0) * 100) / 100;
    if (!window.confirm(`Remove ${fixableExtras.length} ${fixableExtras.length === 1 ? "duplicate" : "duplicates"}?\n\n${fixableExtras.map((row) => `· ${String(row.date).slice(0, 10)} · ${row.description ?? ""} · ${formatKes(Math.abs(row.effect))}`).join("\n")}\n\nThese are already counted by this statement. Removing them moves the balance by ${formatKes(-total)}.`)) return;
    setFixingExtras(true);
    let failed = 0;
    for (const row of fixableExtras) {
      try { await sendJson(`/api/joint-account/${row.id}`, "DELETE"); } catch { failed += 1; }
    }
    await queryClient.invalidateQueries();
    setFixingExtras(false);
    if (failed > 0) toast({ variant: "destructive", title: "Some were not removed", description: `${failed} could not be removed. Delete them on Bank accounts.` });
  };
  // And the other way: what the statement has that this account does not.
  const missing = useMemo(
    () => (statementReading && account ? missingInJamvi(statementReading, accountRows as unknown as RecordedRow[]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statementReading, account],
  );
  const [addingMissing, setAddingMissing] = useState(false);
  const addMissingCharges = async () => {
    if (!missing || missing.charges.length === 0 || addingMissing || !accountId) return;
    const total = missing.charges.reduce((sum, charge) => sum + charge.amount, 0);
    if (!window.confirm(`Add ${missing.charges.length} missing ${missing.charges.length === 1 ? "charge" : "charges"}?\n\n${missing.charges.map((charge) => `· ${charge.date} · ${charge.description} · ${formatKes(charge.amount)}`).join("\n")}\n\nOn the statement, but never saved here. They go under ${effectiveChargeCategory || "the charges category"}, each beside its payment, and move the balance by ${formatKes(-total)}.`)) return;
    setAddingMissing(true);
    let failed = 0;
    for (const charge of missing.charges) {
      try {
        await createDisbursement.mutateAsync({
          data: {
            amount: charge.amount,
            description: charge.description,
            date: charge.date,
            madeById: user?.id ?? null,
            expenseCategory: effectiveChargeCategory,
            destinationKind: "category",
            accountId,
            chargeForTransactionId: charge.parentId,
          } as never,
        });
      } catch {
        failed += 1;
      }
    }
    await queryClient.invalidateQueries();
    setAddingMissing(false);
    if (failed > 0) toast({ variant: "destructive", title: "Some were not added", description: `${failed} could not be added. Record them on Bank accounts.` });
  };
  // This statement's own Fuliza lines saved from an earlier download of the same days.
  const fulizaUpdates = (missing?.amounts ?? []).filter((row) => row.fixable);
  const [updatingFuliza, setUpdatingFuliza] = useState(false);
  const updateFuliza = async () => {
    if (fulizaUpdates.length === 0 || updatingFuliza) return;
    if (!window.confirm(`Update to this statement?\n\n${fulizaUpdates.map((row) => `· ${row.description}: ${formatKes(row.recorded)} → ${formatKes(row.statement)}`).join("\n")}\n\nThis statement covers more of the same days, so its Fuliza figures are the ones to keep.`)) return;
    setUpdatingFuliza(true);
    let failed = 0;
    for (const row of fulizaUpdates) {
      try { await sendJson(`/api/joint-account/${row.id}`, "PUT", { amount: row.statement, date: row.date }); } catch { failed += 1; }
    }
    await queryClient.invalidateQueries();
    setUpdatingFuliza(false);
    if (failed > 0) toast({ variant: "destructive", title: "Some were not updated", description: `${failed} could not be updated. Edit them on Bank accounts.` });
  };
  // One entry saved for a different amount: set to the statement's.
  const [correcting, setCorrecting] = useState<number | null>(null);
  const applyStatementAmount = async (row: { id: number; date: string; description: string; recorded: number; statement: number }) => {
    if (!window.confirm(`Change it to ${formatKes(row.statement)}?\n\n${row.date} · ${row.description}\n\nSaved as ${formatKes(row.recorded)}; your M-Pesa statement says ${formatKes(row.statement)}.`)) return;
    setCorrecting(row.id);
    try {
      await sendJson(`/api/joint-account/${row.id}`, "PUT", { amount: row.statement, date: row.date });
      await queryClient.invalidateQueries();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change it", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setCorrecting(null);
    }
  };

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
    // The entry may be hidden by a filter or the search, or not drawn yet:
    // show everything as far as it, then go to it.
    setView("all");
    setFind("");
    const at = (lines ?? []).filter(isRecordable).findIndex((item) => item.index === firstProblemIndex);
    setShownCount((count) => Math.max(count, Math.ceil((at + 1) / LINES_PER_PAGE) * LINES_PER_PAGE));
    window.setTimeout(() => document.querySelector(`[data-testid="mpesa-line-${firstProblemIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };
  const review = useMemo(() => (lines ? reviewCounts(lines, choices) : null), [lines, choices]);
  const firstProblem = useMemo(() => {
    if (!lines) return null;
    for (const item of lines) {
      const problem = problemWith(item, choices[item.index]);
      if (problem) return `${lineLabel(item)}: ${problem}`;
    }
    if (summary && summary.fees > 0 && !effectiveChargeCategory.trim()) return "Choose a category for the M-Pesa charges.";
    return null;
  }, [lines, choices, summary, effectiveChargeCategory]);

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
  // Somebody not yet in Who owes who, added from the debt editor itself.
  const [newParty, setNewParty] = useState<{ name: string; kind: "person" | "institution" } | null>(null);
  const [addingParty, setAddingParty] = useState(false);
  useEffect(() => {
    if (debtEditing === null) setNewParty(null);
  }, [debtEditing === null]);
  const addParty = async () => {
    const name = newParty?.name.trim() ?? "";
    if (!newParty || !debtEditing || name.length < 2 || addingParty) return;
    setAddingParty(true);
    try {
      const response = await fetch("/api/contributors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind: newParty.kind }),
      });
      const body = (await response.json().catch(() => ({}))) as PartyLite & { error?: string };
      if (!response.ok) throw Object.assign(new Error(body.error ?? "Could not add them."), { status: response.status, data: body });
      queryClient.setQueryData<PartyLite[]>(["parties"], (current) => [...(current ?? []), body]);
      void queryClient.invalidateQueries({ queryKey: ["parties"] });
      setDebtEditing({ ...debtEditing, partyId: String(body.id) });
      setNewParty(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add them", description: plainSaveError(error) });
    } finally {
      setAddingParty(false);
    }
  };
  const setDebt = (index: number, debt: { kind: DebtKind; partyId: number } | null) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], debt } }));

  const transferHints = useMemo(() => throughMpesaHints(lines ?? []), [lines]);
  const otherAccounts = accounts.filter((option) => option.id !== accountId);

  // Recording a line in a different budget entirely — a side hustle run as its own project,
  // say. Only a budget this person actually manages, so recording in it is always allowed.
  // Its accounts, categories and income sources are read without ever switching to it, then
  // kept for the rest of this review so picking it on a second line costs nothing further.
  const { data: allWorkspaces = [] } = useGetWorkspaces();
  const otherManagedBudgets = (allWorkspaces as Workspace[]).filter(
    (workspace) => workspace.id !== group?.id && (workspace.role === "owner" || workspace.role === "admin"),
  );
  const [otherBudgetOptions, setOtherBudgetOptions] = useState<Record<number, OtherBudgetOptions>>({});
  const [loadingOtherBudget, setLoadingOtherBudget] = useState<number | null>(null);
  const loadOtherBudgetOptions = async (groupId: number): Promise<OtherBudgetOptions | null> => {
    const cached = otherBudgetOptions[groupId];
    if (cached) return cached;
    setLoadingOtherBudget(groupId);
    try {
      const options = await fetchOtherBudgetOptions(groupId);
      setOtherBudgetOptions((current) => ({ ...current, [groupId]: options }));
      return options;
    } catch (error) {
      toast({ variant: "destructive", title: "Could not read that budget", description: error instanceof Error ? error.message : "Please try again." });
      return null;
    } finally {
      setLoadingOtherBudget(null);
    }
  };
  const recordable = lines?.filter(isRecordable) ?? [];
  const notImported = lines?.filter((item) => !isRecordable(item)) ?? [];
  // A month at a time, for a statement that runs January to September.
  const [month, setMonth] = useState<string | null>(null);
  const months = useMemo(() => monthsOf(recordable), [lines]);
  const monthLabel = months.find((option) => option.key === month)?.label;
  const filtering = Boolean(find.trim()) || month !== null;
  const foundFor = [monthLabel ? `in ${monthLabel}` : "", find.trim() ? `for "${find.trim()}"` : ""].filter(Boolean).join(" ") || "here";
  const inView = recordable.filter((item) => (view === "all" || reviewStatus(item, choices[item.index]) === view) && lineMatches(item, find, choices[item.index]?.category) && inMonth(item, month));
  const toConfirm = filtering ? confirmableLines(inView, choices) : [];
  const toCategorise = filtering ? categorisableLines(inView, choices) : [];
  // Money in that was found: one income stream for all of it ("in 50,000" is salary).
  const toStream = filtering ? streamableLines(inView, choices) : [];
  const [bulkStream, setBulkStream] = useState("");
  const streamFound = () => {
    const source = incomeSources.find((row) => String(row.id) === bulkStream);
    if (!source) return;
    if (!window.confirm(`Put ${toStream.length} ${toStream.length === 1 ? "entry" : "entries"} under ${source.name}?\n\nEvery entry of money in found for ${foundFor}, including any not shown yet. They count as confirmed, and nothing is saved until you click Save.`)) return;
    setChoices((current) => streamLines(toStream, current, source.id));
  };
  // Found entries that can go to another budget together: "Umoja" finds the chama's.
  const toSend = filtering ? sendableLines(inView, choices) : [];
  // Everything still on Jamvi's suggestion (or needing a choice) under Not sure,
  // so a long statement can be saved now and sorted out slowly from Home.
  const toNotSure = notSureableLines(filtering ? inView : recordable, choices);
  const allUnderNotSure = () => {
    if (!window.confirm(`Put ${toNotSure.length} ${toNotSure.length === 1 ? "entry" : "entries"} under Not sure?\n\nEvery entry ${filtering ? `found ${foundFor}` : "in this statement"} that is still Jamvi's suggestion or still needs you, including any not shown yet. Money out goes to Not sure yet and money in to no income source; anything you chose yourself stays as it is. They count as confirmed, so Save takes them all, and Home's "to sort out" brings each one back to you.`)) return;
    setChoices((current) => putUnderNotSure(toNotSure, current));
  };
  const [sendFound, setSendFound] = useState<{ groupId: number | null; accountId: number; category: string; incomeSourceId: number | null }>({ groupId: null, accountId: 0, category: "", incomeSourceId: null });
  const sendFoundTo = (groupName: string, accountName: string) => {
    if (sendFound.groupId === null) return;
    if (!window.confirm(`Send ${toSend.length} ${toSend.length === 1 ? "entry" : "entries"} to ${groupName}?\n\nEvery entry found for ${foundFor}, including any not shown yet, is recorded in ${groupName}'s ${accountName} instead of here. They count as confirmed, and Jamvi remembers these payees go there unless you untick it. Nothing is saved until you click Save.`)) return;
    const target = { groupId: sendFound.groupId, groupName, accountId: sendFound.accountId, accountName, category: sendFound.category, incomeSourceId: sendFound.incomeSourceId };
    setChoices((current) => sendLinesToOtherBudget(toSend, current, target));
    setSendFound({ groupId: null, accountId: 0, category: "", incomeSourceId: null });
  };
  // A payee remembered as another budget's is suggested there, waiting to be
  // confirmed. Only lines still on Jamvi's suggestion; returns the same choices
  // when nothing changes, so this settles at once.
  const managedIds = otherManagedBudgets.map((workspace) => workspace.id);
  useEffect(() => {
    if (!lines || Object.keys(otherRules).length === 0) return;
    setChoices((current) => applyOtherBudgetRules(lines, current, otherRules, managedIds));
    for (const groupId of new Set(lines.map((item) => otherBudgetRuleFor(item, otherRules)?.rule.groupId).filter((id): id is number => id != null && managedIds.includes(id)))) {
      if (!otherBudgetOptions[groupId]) void fetchOtherBudgetOptions(groupId).then((options) => setOtherBudgetOptions((current) => ({ ...current, [groupId]: options }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, otherRules, managedIds.join(",")]);
  const confirmedLines = recordable.filter((item) => isConfirmedToSave(item, choices[item.index]));
  const confirmedCount = confirmedLines.length;

  // The same subscription the menu reads, for whether a trial or a paid
  // subscription is what ended.
  const { data: entitlements } = useEntitlements();
  // One plain message when the trial or subscription has ended, with the way
  // to pay, in place of the same 402 listed under every entry.
  const lapsedCard = (waiting: number) => {
    const words = lapsedSaveMessage(entitlements?.status, waiting, isShared);
    return (
      <div className="space-y-2 rounded-xl border border-primary bg-card p-4 text-sm" data-testid="mpesa-save-lapsed">
        <p className="flex items-center gap-2 font-semibold text-foreground"><Lock className="h-4 w-4 text-primary" /> {words.title}</p>
        <p className="text-muted-foreground">{words.body.replace("tap Save", "click Save")}</p>
        <Link href="/subscription" className="inline-flex h-10 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground" data-testid="mpesa-save-lapsed-pay">
          {words.action}
        </Link>
      </div>
    );
  };
  const confirmedFees = confirmedLines.some((item) => (item.fee ?? 0) > 0);
  // A new statement starts again from the first page. Changing the view or
  // the search does too - in their handlers, not here, so that going to a
  // problem can draw further after switching to All.
  useEffect(() => {
    setShownCount(LINES_PER_PAGE);
  }, [lines?.length]);
  // Keeps Jamvi's suggestion as checked, or takes that back.
  // Confirming keeps Jamvi's suggestion - and remembers it, unless unticked.
  const confirm = (index: number, confirmed: boolean) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], confirmed, ...(confirmed ? { remember: current[index]?.remember ?? true } : {}) } }));
  const confirmFound = () => {
    if (!window.confirm(`Confirm ${toConfirm.length} ${toConfirm.length === 1 ? "entry" : "entries"}?\n\nEvery suggestion found for ${foundFor}, including any not shown yet, is kept as Jamvi suggested. Nothing is saved until you click Save.`)) return;
    setChoices((current) => confirmLines(toConfirm, current));
  };
  const categoriseFound = () => {
    const name = bulkCategory.trim();
    if (!name) return;
    if (!window.confirm(`Put ${toCategorise.length} ${toCategorise.length === 1 ? "entry" : "entries"} under ${name}?\n\nEvery entry found for ${foundFor} that is money out, including any not shown yet. They count as confirmed, and nothing is saved until you click Save.`)) return;
    setChoices((current) => categoriseLines(toCategorise, current, name));
  };
  const readAgain = () => {
    if (!window.confirm("Read this statement again?\n\nChoose the same statement PDF and type its password. Everything you have confirmed or changed is kept, and nothing is saved or removed. You can go back to your entries until it is read.")) return;
    setRereading(true);
  };
  // Throwing a statement away loses days of choices, so it is asked first.
  const startOverStatement = () => {
    const worked = confirmedCount;
    if (!window.confirm(`Start over with this statement?\n\n${worked > 0 ? `The ${worked} ${worked === 1 ? "entry" : "entries"} you have confirmed or changed but not saved will be lost. ` : ""}Anything already saved stays in your budget.`)) return;
    setRereading(false);
    setLines(null);
    setChoices({});
    setStatementNote(null);
    setStatementReading(null);
  };

  const setCategory = (index: number, category: string) =>
    setChoices((current) => chooseLineCategory(lines ?? [], current, index, category));
  const addCategoryFor = async (index: number) => {
    const name = newCategoryName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Name it", description: "Give this category a clear name, such as Transport or Airtime." });
      return;
    }
    const existing = categories.find((row) => row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      setCategory(index, existing.name);
      closeAddCategory();
      return;
    }
    const budgetAmount = newCategoryBudget.trim() === "" ? 0 : Number(newCategoryBudget.replace(/[^0-9]/g, ""));
    if (!Number.isInteger(budgetAmount) || budgetAmount < 0) {
      toast({ variant: "destructive", title: "Budget not valid", description: "Enter a whole number of shillings, or leave it blank to budget it later." });
      return;
    }
    try {
      const placed = await resolveGroupChoice(newCategoryGroup, newCategoryGroupName, categories, (groupName) =>
        createCategory.mutateAsync({ data: { name: groupName, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } }));
      if ("error" in placed) {
        toast({ variant: "destructive", title: "Choose where it goes", description: placed.error });
        return;
      }
      const created = await createCategory.mutateAsync({
        data: { name, budgetAmount, priority: 3, isRecurring: true, activeMonth: null, activeYear: null, ...(placed.parentId !== null ? { parentId: placed.parentId } : {}) },
      });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      setCategory(index, created.name);
      closeAddCategory();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add it", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  // Changing the category of entries already recorded: nothing else about them is touched.
  const pendingChanges = useMemo(() => categoryChanges(lines ?? [], recat), [lines, recat]);
  const applyRecategorise = async () => {
    if (pendingChanges.length === 0 || recategorising) return;
    if (!window.confirm(`Change ${pendingChanges.length} ${pendingChanges.length === 1 ? "category" : "categories"}?\n\nOnly the category changes. Their amounts, dates and everything else stay as they are.`)) return;
    setRecategorising(true);
    try {
      const body: { updated: number; skipped: string[] } = { updated: 0, skipped: [] };
      for (let start = 0; start < pendingChanges.length; start += RECEIPT_BATCH) {
        const response = await fetch("/api/mpesa/import/recategorise", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: pendingChanges.slice(start, start + RECEIPT_BATCH) }),
        });
        const part = (await response.json().catch(() => ({}))) as { updated?: number; skipped?: string[]; error?: string };
        if (!response.ok || part.updated === undefined) throw new Error(part.error ?? "Could not change them.");
        body.updated += part.updated;
        body.skipped.push(...(part.skipped ?? []));
      }
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
  const rawPostingApi: PostingApi = {
    deposit: (data) => createDeposit.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    disbursement: (data) => createDisbursement.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    bankToBank: (data) => transferBankToBank.mutateAsync({ data: data as never }) as Promise<{ outgoing: { id: number }; incoming: { id: number } }>,
    toSavings: (data) => transferBankToSavings.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    fromSavings: (data) => transferSavingsToBank.mutateAsync({ data: data as never }) as Promise<{ id: number }>,
    // Named explicitly, on the plain client rather than a mutation hook: this never belongs to
    // the current budget's own cache, and its own membership check is verified again server side.
    otherBudget: async (groupId, direction, data) => {
      const options = { headers: { "x-jamvi-workspace": String(groupId) } };
      return direction === "in"
        ? createDepositInOtherBudget(data as never, options)
        : createDisbursementInOtherBudget(data as never, options);
    },
  };
  // Each request tried again through a server restart or a cut - the M-Pesa
  // charge as much as the entry it came with (lib/save-retry).
  const postingApi: PostingApi = withRetries(rawPostingApi, (task) => retrySave(task));

  const saveAll = async (resuming = false) => {
    if (!lines || !accountId || saving) return;
    // A statement is worked through over days: only what has been confirmed
    // goes, and only after saying so. Pasted messages save everything ready.
    // A save being finished after it was cut short was asked for already.
    const onlyConfirmed = statementReading !== null;
    if (onlyConfirmed && !resuming) {
      if (confirmedCount === 0) {
        toast({ title: "Nothing confirmed yet", description: "Tick Confirm on the entries you have checked, or change them, and they are saved. The rest stay here for later." });
        return;
      }
      if (confirmedFees && !effectiveChargeCategory.trim()) {
        toast({ variant: "destructive", title: "Not quite ready", description: "Choose a category for the M-Pesa charges." });
        return;
      }
      const left = recordable.length - confirmedCount;
      if (!window.confirm(`Save ${confirmedCount} ${confirmedCount === 1 ? "entry" : "entries"}?\n\nOnly the ${confirmedCount === 1 ? "entry" : "entries"} you have confirmed or changed.${left > 0 ? ` The other ${left} stay here for later.` : ""}`)) return;
    } else if (firstProblem) {
      toast({ variant: "destructive", title: "Not quite ready", description: firstProblem });
      return;
    }
    setSaving(true);
    void keepScreenAwakeWhileSaving();
    // Remembered until it finishes: closed part way, it is carried on next time.
    const savingFor = group?.id;
    markSavePending(savingFor);
    const result: Outcome = { saved: 0, repeats: 0, failed: [] };
    const savedIndexes = new Set<number>();
    // What each saved line became, for marking money in left on "Not sure".
    const depositIds = new Map<number, number>();
    // And what each line sent to another budget became there.
    const otherBudgetMade = new Map<number, { groupId: number; id: number }>();
    // Who each debt entry was for, kept so deleting it can offer to put that person's balance back.
    const debtLinks: DebtEntryLink[] = [];
    // M-Pesa's own name for each entry saved under a nickname, for Search.
    const mpesaNames: MpesaName[] = [];
    // Fuliza still owed, or repaid, is a debt to Fuliza in Who owes who: found
    // there, or added once, and both lines linked to it.
    let saveChoices = choices;
    let saveParties = parties;
    if (needsFulizaParty(lines, choices)) {
      try {
        const found = findFulizaParty(parties);
        const fuliza: PartyLite = found ?? await fetch("/api/contributors", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: FULIZA_PARTY_NAME, kind: "institution" }),
          }).then(async (response) => {
            if (!response.ok) throw new Error("Could not add Fuliza to Who owes who.");
            return (await response.json()) as PartyLite;
          });
        if (!found) saveParties = [...parties, fuliza];
        saveChoices = withFulizaDebt(lines, choices, fuliza.id);
        setChoices(saveChoices);
      } catch {
        // Saved unlinked: the borrowing still is not income; a repayment says why it failed.
      }
    }
    // "Not sure yet" is a real category, made the first time it is needed, so
    // the entry still counts as spending (lib/entriesToSort).
    if (needsNotSureCategory(lines, choices, categoryList.map((row) => row.name))) {
      try {
        await createCategory.mutateAsync({ data: { name: NOT_SURE_CATEGORY, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null } });
        void queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      } catch {
        // Already there, or it fails each entry with a reason of its own.
      }
    }
    // Worked out once, so a handful of these can travel to the server together instead of
    // waiting for each round trip before starting the next.
    const toSave = lines.flatMap((item) => {
      const choice = saveChoices[item.index];
      if (!choice?.include || !isRecordable(item)) return [];
      if (onlyConfirmed && !isConfirmedToSave(item, choice)) return [];
      const built = buildPostings(item, choice, {
        accountId,
        userId: user?.id,
        isShared,
        today: todayIso(),
        chargeCategory: effectiveChargeCategory,
        incomeSources,
        memberIds,
      });
      return built ? [{ item, choice, built }] : [];
    });
    setSaveProgress({ done: 0, total: toSave.length });
    // Set by the first refusal for a lapsed trial or subscription: the rest
    // would be refused the same way, so they are not sent.
    let lapsed = false;
    try {
      await runPool(toSave, SAVE_CONCURRENCY, async ({ item, choice, built }) => {
        if (lapsed) return;
        try {
          const posted = await savePosting(built, postingApi, accountId);
          if (choice.debt && posted.id) debtLinks.push({ transactionId: posted.id, partyId: choice.debt.partyId, kind: choice.debt.kind });
          const named = mpesaNameFor(posted.id, item.original, item.description);
          if (named) mpesaNames.push(named);
          if (posted.feeFailed) result.failed.push({ what: `${item.description} charge`, why: `The entry saved, but its M-Pesa charge${item.fee ? ` of KES ${item.fee}` : ""} did not. Add it on Bank accounts as money out.` });
          result.saved += 1;
          savedIndexes.add(item.index);
          if (posted.id !== undefined && item.direction === "in") depositIds.set(item.index, posted.id);
          if (posted.otherBudget) otherBudgetMade.set(item.index, posted.otherBudget);
        } catch (error) {
          if (isLapsedRefusal(error)) {
            lapsed = true;
            return;
          }
          const message = plainSaveError(error);
          if (/already recorded/i.test(message)) {
            result.repeats += 1;
            // Already on the server: shown as recorded, not left looking unsaved.
            savedIndexes.add(item.index);
          }
          else result.failed.push({ what: item.description ?? "A message", why: message });
        } finally {
          setSaveProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
        }
      });
    } finally {
      setSaveProgress(null);
      setSaving(false);
      letScreenSleepAgain();
      clearSavePending(savingFor);
      if (lapsed) result.lapsed = { waiting: toSave.length - result.saved - result.repeats };
      let leftToSave = 0;
      if (statementReading) {
        const stamp = { date: todayIso(), description: "Saved from your statement" };
        const marked = lines.map((item) => (savedIndexes.has(item.index) ? { ...item, alreadyRecorded: stamp } : item));
        setLines(marked);
        setStatementReading((current) => (current ? { ...current, lines: marked } : current));
        leftToSave = marked.filter(isRecordable).length;
      }
      // Part of a statement saved: stay on it, with how it went at the top.
      if (leftToSave > 0) {
        setLastSave(result);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setOutcome(result);
      }
      if (result.saved > 0) rememberMpesaCard("done");
    }
    {
      let kept = rules;
      let keptOther = otherRules;
      for (const item of lines) {
        const choice = choices[item.index];
        if (!savedIndexes.has(item.index) || !choice?.remember) continue;
        if (choice.otherBudget) {
          // This payee belongs to that budget: remembered there, not as a category here.
          keptOther = withOtherBudgetRule(keptOther, item, choice.otherBudget);
          continue;
        }
        // Kept here this time: a budget remembered for it before no longer applies.
        keptOther = withoutOtherBudgetRule(keptOther, item);
        if (choice.category.trim() && item.description && !isNotSure(choice.category)) {
          kept = withRule(kept, item.description, choice.category, item.payeeNumber);
        }
      }
      if (kept !== rules) keepRules(kept);
      if (keptOther !== otherRules) keepOtherRules(keptOther);
    }
    void saveDebtLinks(debtLinks);
    // Money in left on "Not sure" is kept to sort out later; Home says so.
    {
      const toMark = toMarkAfterSave(lines, choices, depositIds, incomeSources.length > 0);
      if (toMark.length > 0) {
        void fetch("/api/entries-to-sort", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionIds: toMark }),
        }).then(() => queryClient.invalidateQueries({ queryKey: ["entries-to-sort"] })).catch(() => {});
      }
      void queryClient.invalidateQueries({ queryKey: ["entries-to-sort"] });
      // Sent to another budget on "Not sure": kept to sort out there, on its own Home.
      for (const [groupId, ids] of otherBudgetToMark(lines, choices, otherBudgetMade)) {
        void fetch("/api/entries-to-sort", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-jamvi-workspace": String(groupId) },
          body: JSON.stringify({ transactionIds: ids }),
        }).catch(() => {});
      }
    }
    void saveMpesaNames(mpesaNames);
    void offerBalanceChanges(lines.filter((item) => savedIndexes.has(item.index)), saveChoices, saveParties);
  };

  /**
   * Once, at the end, for everything that was saved. Asked and never applied by
   * itself: the entries can be edited or deleted afterwards, and a balance moved
   * behind somebody's back would be left quietly wrong.
   */
  const offerBalanceChanges = async (saved: PreviewLine[], savedChoices = choices, knownParties = parties) => {
    const changes = balanceChanges(saved, savedChoices, knownParties, debtCategories);
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

  // Finishes a save that was cut short, once the entries and the account are back.
  useEffect(() => {
    if (!resumeSave || !lines || !accountId || saving) return;
    setResumeSave(false);
    // Cut short after the last entry went: nothing is left, so only the note goes.
    if (!lines.some((item) => isConfirmedToSave(item, choices[item.index]))) {
      clearSavePending(group?.id);
      setStatementNote(null);
      return;
    }
    void saveAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSave, lines, accountId, saving]);

  if (outcome) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6" data-testid="mpesa-import-done">
        {outcome.lapsed ? lapsedCard(outcome.lapsed.waiting) : null}
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
            <DialogDescription>Categories you asked Jamvi to keep for a payee, and payees that belong to another budget. Forget one and it goes back to being suggested from your history.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {Object.entries(rules).map(([key, category]) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                <span>{ruleLabel(key)} → {category}</span>
                <Button variant="ghost" size="sm" onClick={() => keepRules(withoutRule(rules, key))} aria-label={`Forget ${key}`} data-testid={`mpesa-rule-forget-${key}`}>Forget</Button>
              </div>
            ))}
            {Object.entries(otherRules).map(([key, rule]) => (
              <div key={`other-${key}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                <span>{otherBudgetRuleLabel(key)} → {rule.groupName}{rule.category ? ` · ${rule.category}` : ""}</span>
                <Button variant="ghost" size="sm" onClick={() => keepOtherRules(withoutOtherBudgetRule(otherRules, key))} aria-label={`Forget ${key} going to ${rule.groupName}`} data-testid={`mpesa-other-rule-forget-${key}`}>Forget</Button>
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
        <h1 className="text-2xl font-bold text-foreground">Import M-Pesa</h1>
        <p className="text-sm text-muted-foreground">Read your M-Pesa statement, or paste messages, into entries - without typing.</p>
        {/* Which budget these land in: the one switched to last, which may not be the one with the categories. */}
        <p className="mt-2 text-sm text-foreground" data-testid="mpesa-budget-row">
          These will be saved in <span className="font-semibold" data-testid="mpesa-budget-name">{group?.name ?? "…"}</span>. Use the budget switcher to change it.
        </p>
      </div>

      {!lines || rereading ? (
        <>
          {rereading ? (
            <Card data-testid="mpesa-rereading">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm text-foreground">Choose the same statement PDF and read it again. Everything you have confirmed or changed is kept.</p>
                <button type="button" onClick={() => setRereading(false)} className="text-sm font-semibold text-primary" data-testid="mpesa-rereading-back">Back to my entries</button>
              </CardContent>
            </Card>
          ) : null}
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
                setChoices(initialChoices(lines, [], categories.map((row) => row.name), effectiveChargeCategory, rules, canManageBudget));
              }}
              data-testid="mpesa-import-account"
            >
              {accounts.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>

          {!canManageBudget ? (
            <p className="rounded-xl border border-destructive bg-card p-3 text-sm text-foreground" data-testid="mpesa-member-warning">
              You are a member of this group, so you can record money that came in, but not payments out, moves between accounts or savings. Those are left unticked. A group owner or admin can record them.
            </p>
          ) : null}
          {statementNote ? (
            <p className="rounded-xl border border-border bg-card p-3 text-sm text-foreground" data-testid="mpesa-statement-note">{statementNote}</p>
          ) : null}
          {lastSave?.lapsed ? lapsedCard(confirmedCount) : null}
          {lastSave && !(lastSave.lapsed && lastSave.saved === 0 && lastSave.failed.length === 0) ? (
            <div className={`space-y-1 rounded-xl border bg-card p-3 text-sm ${lastSave.failed.length > 0 ? "border-destructive" : "border-success"}`} data-testid="mpesa-last-save">
              <div className="flex items-center gap-2">
                <p className="flex-1 font-semibold text-foreground">
                  Saved {lastSave.saved}{lastSave.repeats > 0 ? ` · ${lastSave.repeats} already recorded` : ""}{lastSave.failed.length > 0 ? ` · ${lastSave.failed.length} not saved` : ""}
                </p>
                <button type="button" onClick={() => setLastSave(null)} className="text-xs font-semibold text-muted-foreground" data-testid="mpesa-last-save-dismiss">Dismiss</button>
              </div>
              {lastSave.failed.slice(0, 10).map((failure, index) => (
                <p key={`${failure.what}-${index}`} className="text-xs text-destructive">{failure.what}: {failure.why}</p>
              ))}
              {lastSave.failed.length > 10 ? <p className="text-xs text-muted-foreground">and {lastSave.failed.length - 10} more. Save again to try them.</p> : null}
              <p className="text-xs text-muted-foreground">The rest of your statement is below, as you left it.</p>
            </div>
          ) : null}
          {statementReading ? (
            <div className="flex flex-wrap gap-4">
              <button type="button" onClick={readAgain} className="text-sm font-semibold text-primary" data-testid="mpesa-read-again">Read my statement again (keeps your choices)</button>
              <button type="button" onClick={startOverStatement} className="text-sm font-semibold text-destructive" data-testid="mpesa-statement-start-over">Start over with this statement</button>
            </div>
          ) : null}
          {statementReading && !balanceCheck ? (
            <p className="rounded-xl border border-border bg-card p-3 text-sm text-foreground" data-testid="mpesa-balance-missing">
              Jamvi could not work out this statement's starting and closing balance, so it cannot check them or set this account's starting balance. Reading it again with the latest Jamvi fixes that, and keeps your choices.
            </p>
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
                {openingFix && canManageBudget ? (
                  <div className="space-y-2 rounded-lg border border-border p-3" data-testid="mpesa-opening-fix">
                    <p className="text-foreground">
                      Your statement starts at {formatKes(openingFix.to)}, but this account starts at {formatKes(openingFix.current)}.
                      Nothing is recorded in it before the statement, so its starting balance can simply be set to match.
                    </p>
                    <Button onClick={() => void fixOpeningBalance()} disabled={openingSaving} data-testid="mpesa-opening-fix-button">
                      {openingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Start this account at ${formatKes(openingFix.to)}`}
                    </Button>
                  </div>
                ) : null}
                {balanceSides && !openingFix ? (
                  <div className="space-y-1" data-testid="mpesa-balance-sides">
                    <p className="text-foreground">On {balanceSides.startDay}: Jamvi {formatKes(balanceSides.jamviStart)} · M-Pesa {formatKes(balanceSides.mpesaStart)}</p>
                    <p className="text-foreground">On {balanceSides.endDay}: Jamvi {formatKes(balanceSides.jamviEnd)} · M-Pesa {formatKes(balanceSides.mpesaEnd)}</p>
                    {Math.abs(balanceSides.jamviStart - balanceSides.mpesaStart) >= 0.005 ? (
                      <p className="text-destructive" data-testid="mpesa-balance-before">
                        {formatKes(Math.round((balanceSides.mpesaStart - balanceSides.jamviStart) * 100) / 100)} of the difference is from before {balanceSides.startDay}: this account&apos;s starting balance, or entries before then, do not match M-Pesa. Import the statement for the month before to find them.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {extras && extras.rows.length > 0 ? (
                  <div className="space-y-1" data-testid="mpesa-not-on-statement">
                    <p className="font-semibold text-foreground">
                      In Jamvi but not on this statement: {extras.rows.length} {extras.rows.length === 1 ? "entry" : "entries"}, {formatKes(extras.net)}
                    </p>
                    <p className="text-muted-foreground">These move the balance but M-Pesa has no record of them. Remove any that did not happen, or were recorded twice.</p>
                    {fixableExtras.length > 0 && canManageBudget ? (
                      <Button onClick={() => void fixExtras()} disabled={fixingExtras} data-testid="mpesa-fix-extras">
                        {fixingExtras ? <Loader2 className="h-4 w-4 animate-spin" /> : `Fix ${fixableExtras.length} for me`}
                      </Button>
                    ) : null}
                    <ul className="space-y-1">
                      {extras.rows.slice(0, 20).map((row) => (
                        <li key={row.id} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-foreground">
                            {String(row.date).slice(0, 10)} · {row.description ?? ""} · {row.effect < 0 ? "−" : "+"}{formatKes(Math.abs(row.effect))} ({row.why})
                          </span>
                          {canManageBudget ? (
                            <button type="button" onClick={() => removeExtra(row)} className="text-sm font-semibold text-destructive hover:underline" data-testid={`mpesa-extra-remove-${row.id}`}>Remove</button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {extras.rows.length > 20 ? <p className="text-muted-foreground">and {extras.rows.length - 20} more</p> : null}
                  </div>
                ) : null}
                {missing && (missing.charges.length > 0 || missing.amounts.length > 0) ? (
                  <div className="space-y-1" data-testid="mpesa-missing-in-jamvi">
                    <p className="font-semibold text-foreground">
                      On the statement but missing here{missing.charges.length > 0 ? `: ${missing.charges.length} ${missing.charges.length === 1 ? "charge" : "charges"}, ${formatKes(Math.abs(missing.net))}` : ""}
                    </p>
                    {missing.charges.length > 0 && canManageBudget ? (
                      <Button onClick={() => void addMissingCharges()} disabled={addingMissing} data-testid="mpesa-add-missing">
                        {addingMissing ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${missing.charges.length} missing ${missing.charges.length === 1 ? "charge" : "charges"}`}
                      </Button>
                    ) : null}
                    <ul className="space-y-1 text-foreground">
                      {missing.charges.slice(0, 20).map((charge) => (
                        <li key={`c-${charge.parentId}`}>{charge.date} · {charge.description} · −{formatKes(charge.amount)} (the payment is saved, its charge is not)</li>
                      ))}
                    </ul>
                    {fulizaUpdates.length > 0 && canManageBudget ? (
                      <Button onClick={() => void updateFuliza()} disabled={updatingFuliza} data-testid="mpesa-update-fuliza">
                        {updatingFuliza ? <Loader2 className="h-4 w-4 animate-spin" /> : `Update ${fulizaUpdates.length} Fuliza ${fulizaUpdates.length === 1 ? "line" : "lines"} to this statement`}
                      </Button>
                    ) : null}
                    <ul className="space-y-1">
                      {missing.amounts.slice(0, 20).map((row) => (
                        <li key={`a-${row.id}`} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-destructive">
                            {row.date} · {row.description}: saved as {formatKes(row.recorded)}, the statement says {formatKes(row.statement)}.
                          </span>
                          {canManageBudget ? (
                            <button type="button" onClick={() => void applyStatementAmount(row)} disabled={correcting !== null} className="text-sm font-semibold text-primary hover:underline" data-testid={`mpesa-amount-fix-${row.id}`}>
                              {correcting === row.id ? "Changing…" : `Use ${formatKes(row.statement)}`}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
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
                  {summary.toOtherBudgets > 0 ? ` · ${summary.toOtherBudgets} in another budget` : ""}
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

          {Object.keys(rules).length + Object.keys(otherRules).length > 0 ? (
            <button type="button" onClick={() => setRulesOpen(true)} className="text-left text-sm font-semibold text-primary" data-testid="mpesa-rules-open">
              What Jamvi remembers ({Object.keys(rules).length + Object.keys(otherRules).length})
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
                    ["changed", statementReading ? "Confirmed by you" : "Changed by you"],
                    ["suggested", "Suggested"],
                  ] as Array<[ReviewView, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setView(key); setShownCount(LINES_PER_PAGE); }}
                      aria-pressed={view === key}
                      data-testid={`mpesa-review-${key}`}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${view === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-foreground"}`}
                    >
                      {label} ({review[key]})
                    </button>
                  ))}
                </div>
                {toNotSure.length > 0 && canManageBudget ? (
                  <Button variant="outline" className="mt-2 w-full" onClick={allUnderNotSure} data-testid="mpesa-review-all-not-sure">
                    Put {filtering ? `all ${toNotSure.length} found` : `the other ${toNotSure.length}`} under Not sure - sort them out later
                  </Button>
                ) : null}
                {months.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-2" data-testid="mpesa-review-months">
                    {[{ key: null as string | null, label: "All months", count: recordable.length }, ...months].map((option) => (
                      <button
                        key={option.key ?? "all"}
                        type="button"
                        onClick={() => { setMonth(option.key); setShownCount(LINES_PER_PAGE); }}
                        aria-pressed={month === option.key}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${month === option.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted"}`}
                        data-testid={`mpesa-review-month-${option.key ?? "all"}`}
                      >
                        {option.label} ({option.count})
                      </button>
                    ))}
                  </div>
                ) : null}
                <Input
                  value={find}
                  onChange={(event) => { setFind(event.target.value); setShownCount(LINES_PER_PAGE); }}
                  placeholder="Find a name, amount or category, e.g. naivas, in 50,000"
                  className="mt-2"
                  data-testid="mpesa-review-find"
                />
                {filtering ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground" data-testid="mpesa-review-find-count">{inView.length} found</p>
                    {toConfirm.length > 0 ? (
                      <Button variant="outline" className="w-full" onClick={confirmFound} data-testid="mpesa-review-confirm-found">
                        Confirm all {toConfirm.length} suggestions found
                      </Button>
                    ) : null}
                    {toCategorise.length > 0 ? (
                      <div className="flex gap-2">
                        <select
                          value={bulkCategory}
                          onChange={(event) => setBulkCategory(event.target.value)}
                          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          aria-label="One category for every entry found"
                          data-testid="mpesa-review-bulk-category"
                        >
                          <option value="">Choose one category for all {toCategorise.length}</option>
                          {categories.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
                        </select>
                        <Button onClick={categoriseFound} disabled={!bulkCategory} data-testid="mpesa-review-categorise-found">Apply</Button>
                      </div>
                    ) : null}
                    {toStream.length > 0 && incomeSources.length > 0 ? (
                      <div className="flex gap-2">
                        <select
                          value={bulkStream}
                          onChange={(event) => setBulkStream(event.target.value)}
                          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          aria-label="One income stream for every entry of money in found"
                          data-testid="mpesa-review-bulk-stream"
                        >
                          <option value="">Choose one income stream for all {toStream.length}</option>
                          {incomeSources.map((source) => <option key={source.id} value={String(source.id)}>{source.name}</option>)}
                        </select>
                        <Button onClick={streamFound} disabled={!bulkStream} data-testid="mpesa-review-stream-found">Apply</Button>
                      </div>
                    ) : null}
                    {toSend.length > 0 && canManageBudget && otherManagedBudgets.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-border p-3" data-testid="mpesa-review-send-choices">
                        <p className="text-sm font-semibold text-foreground">Send all {toSend.length} found to another budget</p>
                        <select
                          value={sendFound.groupId ?? ""}
                          onChange={async (event) => {
                            const groupId = event.target.value ? Number(event.target.value) : null;
                            if (groupId === null) { setSendFound({ groupId: null, accountId: 0, category: "", incomeSourceId: null }); return; }
                            const options = await loadOtherBudgetOptions(groupId);
                            if (!options) return;
                            setSendFound({ groupId, accountId: options.accounts[0]?.id ?? 0, category: "", incomeSourceId: null });
                          }}
                          className={SELECT_CLASS}
                          aria-label="Budget to send every entry found to"
                          data-testid="mpesa-review-send-budget"
                        >
                          <option value="">Which budget?</option>
                          {otherManagedBudgets.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                        </select>
                        {(() => {
                          if (sendFound.groupId === null) return null;
                          const options = otherBudgetOptions[sendFound.groupId];
                          const target = otherManagedBudgets.find((workspace) => workspace.id === sendFound.groupId);
                          if (!options || !target) return null;
                          const outCount = toSend.filter((line) => line.direction === "out").length;
                          const inCount = toSend.length - outCount;
                          const account = options.accounts.find((option) => option.id === sendFound.accountId);
                          const ready = Boolean(account) && (outCount === 0 || Boolean(sendFound.category));
                          return (
                            <div className="space-y-2">
                              {options.accounts.length === 0 ? (
                                <p className="text-xs text-destructive">{target.name} has no bank account yet. Add one there first.</p>
                              ) : (
                                <select value={sendFound.accountId} onChange={(event) => setSendFound({ ...sendFound, accountId: Number(event.target.value) })} className={SELECT_CLASS} aria-label={`Account in ${target.name}`} data-testid="mpesa-review-send-account">
                                  {options.accounts.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                                </select>
                              )}
                              {outCount > 0 ? (
                                options.categories.length === 0 ? (
                                  <p className="text-xs text-destructive">{target.name} has no categories yet. Add one there first.</p>
                                ) : (
                                  <select value={sendFound.category} onChange={(event) => setSendFound({ ...sendFound, category: event.target.value })} className={SELECT_CLASS} aria-label={`Category in ${target.name}`} data-testid="mpesa-review-send-category">
                                    <option value="">{inCount > 0 ? `What the ${outCount} paid out ${outCount === 1 ? "was" : "were"} for in ${target.name}` : `Which category in ${target.name}?`}</option>
                                    {options.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                                  </select>
                                )
                              ) : null}
                              {inCount > 0 && options.incomeSources.length > 0 ? (
                                <select value={sendFound.incomeSourceId ?? ""} onChange={(event) => setSendFound({ ...sendFound, incomeSourceId: event.target.value ? Number(event.target.value) : null })} className={SELECT_CLASS} aria-label={`Income source in ${target.name}`} data-testid="mpesa-review-send-income">
                                  <option value="">{outCount > 0 ? `Income source for the ${inCount} received (optional)` : "Income source (optional)"}</option>
                                  {options.incomeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                                </select>
                              ) : null}
                              <Button onClick={() => sendFoundTo(target.name, account!.name)} disabled={!ready} data-testid="mpesa-review-send-go">
                                Send {toSend.length} to {target.name}
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {inView.slice(0, shownCount).map((item) => {
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
                      {status === "needs" ? "Needs you" : status === "changed" ? (choice?.confirmed ? "Confirmed" : "You changed this - confirmed, it saves with the next Save") : "Suggested by Jamvi"}
                    </p>
                  ) : null}
                  {statementReading && choice?.include && (status === "suggested" || choice?.confirmed) ? (
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-primary" data-testid={`mpesa-line-confirm-${item.index}`}>
                      <input type="checkbox" checked={Boolean(choice?.confirmed)} onChange={(event) => confirm(item.index, event.target.checked)} />
                      {choice?.confirmed ? "Confirmed" : "Confirm"}
                    </label>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!choice?.include}
                      disabled={!canManageBudget && out}
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
                      onChange={(event) => {
                        if (event.target.value === ADD_CATEGORY) {
                          closeAddCategory();
                          setAddingFor(item.index);
                          return;
                        }
                        setCategory(item.index, event.target.value);
                      }}
                      data-testid={`mpesa-line-category-${item.index}`}
                    >
                      <option value="">Choose what it was for</option>
                      {canManageBudget && !categoryList.some((row) => isNotSure(row.name)) ? <option value={NOT_SURE_CATEGORY}>Not sure yet - sort it out later</option> : null}
                      {search.visible(choice.category).map((group) =>
                        group.children.length > 0 ? (
                          <optgroup key={group.name} label={group.name}>
                            {group.children.map((child) => <option key={child} value={child}>{child}</option>)}
                          </optgroup>
                        ) : (
                          <option key={group.name} value={group.name}>{group.name}</option>
                        ),
                      )}
                      {canManageBudget ? <option value={ADD_CATEGORY}>+ Add a category…</option> : null}
                    </select>
                  ) : null}
                  {addingFor === item.index ? (
                    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid={`mpesa-line-new-category-${item.index}`}>
                      <Input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Name it, such as Transport" className="h-10 bg-card" autoFocus data-testid="mpesa-new-category-name" />
                      <Input value={newCategoryBudget} onChange={(event) => setNewCategoryBudget(event.target.value)} inputMode="numeric" placeholder="Monthly budget, KES (optional)" className="h-10 bg-card" data-testid="mpesa-new-category-budget" />
                      <CategoryGroupPicker
                        categories={categories}
                        value={newCategoryGroup}
                        onChange={setNewCategoryGroup}
                        groupName={newCategoryGroupName}
                        onGroupName={setNewCategoryGroupName}
                        disabled={createCategory.isPending}
                        testId="mpesa-new-category"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={closeAddCategory} disabled={createCategory.isPending}>Cancel</Button>
                        <Button className="flex-1" onClick={() => void addCategoryFor(item.index)} disabled={createCategory.isPending} data-testid="mpesa-new-category-add">
                          {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add and use it"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.category && !isNotSure(choice.category) && item.description && rules[payeeKey(item.description)] !== choice.category ? (
                    // Ticked by itself once a category is chosen or confirmed; untick what Jamvi should not learn.
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground" data-testid={`mpesa-line-remember-${item.index}`}>
                      <input
                        type="checkbox"
                        checked={choice.remember === true}
                        onChange={(event) => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], remember: event.target.checked } }))}
                      />
                      Remember {choice.category} for {payeeName(item.description)}
                    </label>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.category && categoryPath(choice.category, categories) !== choice.category ? (
                    <p className="text-xs text-muted-foreground" data-testid={`mpesa-line-path-${item.index}`}>
                      Filed under {categoryPath(choice.category, categories)}
                    </p>
                  ) : null}
                  {out && choice?.include && !isMove(choice) && choice.category && !isNotSure(choice.category) && item.description && rules[payeeKey(item.description)] !== choice.category ? (
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
                        value={choice.incomeSourceId ?? (choice.confirmed ? NOT_SURE_SOURCE : "")}
                        onChange={(event) =>
                          setChoices((current) => chooseIncomeSource(lines ?? [], current, item.index, event.target.value && event.target.value !== NOT_SURE_SOURCE ? Number(event.target.value) : null))
                        }
                        aria-label="Where did this come from?"
                        data-testid={`mpesa-line-source-select-${item.index}`}
                      >
                        <option value="">Where did this come from? (optional)</option>
                        <option value={NOT_SURE_SOURCE}>Not sure - sort it out later</option>
                        {incomeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                      </select>
                      {choice.sourceAuto && choice.incomeSourceId ? (
                        <p className="text-xs text-muted-foreground" data-testid={`mpesa-line-source-suggested-${item.index}`}>
                          Suggested by Jamvi. Change it if it is wrong.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {canManageBudget && choice?.include && !choice.debt && !choice.contributorId && otherAccounts.length > 0 ? (
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
                  {canManageBudget && choice?.include && destinationOf(choice) !== "debt" && destinationOf(choice) !== "contribution" && canUseSavings(item) && savingsGoals.length > 0 ? (
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
                  {canManageBudget && choice?.include && (destinationOf(choice) === "category" || destinationOf(choice) === "other-budget") && otherManagedBudgets.length > 0 ? (
                    <div className="space-y-1" data-testid={`mpesa-line-other-budget-${item.index}`}>
                      <p className="text-xs text-muted-foreground">Does this belong to a different budget you run?</p>
                      <select
                        className={SELECT_CLASS}
                        value={choice.otherBudget?.groupId ?? ""}
                        disabled={loadingOtherBudget !== null}
                        onChange={async (event) => {
                          const groupId = event.target.value ? Number(event.target.value) : null;
                          if (groupId === null) {
                            setChoices((current) => chooseOtherBudget(current, item.index, null));
                            return;
                          }
                          const target = otherManagedBudgets.find((workspace) => workspace.id === groupId);
                          const options = await loadOtherBudgetOptions(groupId);
                          if (!target || !options) return;
                          setChoices((current) =>
                            chooseOtherBudget(current, item.index, {
                              groupId,
                              groupName: target.name,
                              accountId: options.accounts[0]?.id ?? 0,
                              accountName: options.accounts[0]?.name ?? "",
                            }),
                          );
                        }}
                        aria-label="Send to another budget"
                        data-testid={`mpesa-line-other-budget-select-${item.index}`}
                      >
                        <option value="">No</option>
                        {otherManagedBudgets.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                      </select>
                      {loadingOtherBudget !== null ? <p className="text-xs text-muted-foreground">Reading that budget…</p> : null}
                      {choice.otherBudget && otherBudgetOptions[choice.otherBudget.groupId] ? (
                        (() => {
                          const target = choice.otherBudget!;
                          const options = otherBudgetOptions[target.groupId];
                          return (
                            <div className="space-y-2">
                              {options.accounts.length === 0 ? (
                                <p className="text-xs text-destructive">{target.groupName} has no bank account yet. Add one there first.</p>
                              ) : (
                                <>
                                  <p className="text-xs text-muted-foreground">Which account in {target.groupName}?</p>
                                  <select
                                    className={SELECT_CLASS}
                                    value={target.accountId}
                                    onChange={(event) => setChoices((current) => chooseOtherBudget(current, item.index, { ...target, accountId: Number(event.target.value), accountName: options.accounts.find((a) => a.id === Number(event.target.value))?.name ?? "" }))}
                                    aria-label={`Account in ${target.groupName}`}
                                    data-testid={`mpesa-line-other-budget-account-${item.index}`}
                                  >
                                    {options.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                                  </select>
                                </>
                              )}
                              {out ? (
                                options.categories.length === 0 ? (
                                  <p className="text-xs text-destructive">{target.groupName} has no categories yet. Add one there first.</p>
                                ) : (
                                  <>
                                    <p className="text-xs text-muted-foreground">Which category in {target.groupName}?</p>
                                    <select
                                      className={`${SELECT_CLASS} ${target.category ? "" : "border-destructive"}`}
                                      value={target.category ?? ""}
                                      onChange={(event) => setChoices((current) => chooseOtherBudget(current, item.index, { ...target, category: event.target.value }))}
                                      aria-label={`Category in ${target.groupName}`}
                                      data-testid={`mpesa-line-other-budget-category-${item.index}`}
                                    >
                                      <option value="">Choose what it was for</option>
                                      {options.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                                    </select>
                                  </>
                                )
                              ) : options.incomeSources.length > 0 ? (
                                <>
                                  <p className="text-xs text-muted-foreground">Which income source in {target.groupName}? (optional)</p>
                                  <select
                                    className={SELECT_CLASS}
                                    value={target.incomeSourceId ?? ""}
                                    onChange={(event) => setChoices((current) => chooseOtherBudget(current, item.index, { ...target, incomeSourceId: event.target.value ? Number(event.target.value) : null }))}
                                    aria-label={`Income source in ${target.groupName}`}
                                    data-testid={`mpesa-line-other-budget-income-${item.index}`}
                                  >
                                    <option value="">Not sure</option>
                                    {options.incomeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                                  </select>
                                </>
                              ) : null}
                            </div>
                          );
                        })()
                      ) : null}
                      {choice.otherBudget && item.description ? (
                        <label className="flex items-center gap-2 text-sm text-foreground" data-testid={`mpesa-line-remember-other-${item.index}`}>
                          <input
                            type="checkbox"
                            checked={choice.remember === true}
                            onChange={() => setChoices((current) => ({ ...current, [item.index]: { ...current[item.index], remember: !current[item.index]?.remember } }))}
                            className="h-4 w-4 accent-primary"
                          />
                          {rememberOtherBudgetLabel(item, choice.otherBudget.groupName)}
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {canManageBudget && isShared && item.direction === "in" && choice?.include && !isMove(choice) && destinationOf(choice) !== "debt" && parties.length > 0 ? (
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
                  {choice?.include && !isMove(choice) && !choice.contributorId && canLinkDebt(item, parties) ? (
                    (() => {
                      const linked = choice.debt ? parties.find((party) => party.id === choice.debt!.partyId) : undefined;
                      const guess = !choice.debt && item.direction ? matchParty(item.original ?? item.description, parties) : null;
                      const guessKind = guess && item.direction ? suggestDebtKind(item.direction, guess) : null;
                      if (debtEditing?.index === item.index) {
                        return (
                          <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`mpesa-debt-editor-${item.index}`}>
                            <p className="text-xs text-muted-foreground">
                              If the money was never really yours — it just passed through on its way somewhere else —
                              &ldquo;They are paying me back&rdquo; or &ldquo;I borrowed this from them&rdquo; is still the right choice: it
                              keeps your balance accurate without counting as your income or spending.
                            </p>
                            <select
                              className={SELECT_CLASS}
                              value={newParty ? "__new" : debtEditing.partyId}
                              onChange={(event) => {
                                if (event.target.value === "__new") {
                                  setNewParty({ name: payeeName(item.original ?? item.description ?? ""), kind: "person" });
                                  return;
                                }
                                setNewParty(null);
                                setDebtEditing({ ...debtEditing, partyId: event.target.value });
                              }}
                              aria-label="Who is it?"
                              data-testid={`mpesa-debt-party-${item.index}`}
                            >
                              <option value="">Who is it?</option>
                              {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                              <option value="__new">＋ Someone new</option>
                            </select>
                            {newParty ? (
                              <div className="flex flex-wrap gap-2" data-testid={`mpesa-debt-new-party-${item.index}`}>
                                <Input value={newParty.name} onChange={(event) => setNewParty({ ...newParty, name: event.target.value })} placeholder="Their name, or the company's" className="h-10 min-w-[12rem] flex-1" autoFocus />
                                <select value={newParty.kind} onChange={(event) => setNewParty({ ...newParty, kind: event.target.value as "person" | "institution" })} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="A person or a company">
                                  <option value="person">A person</option>
                                  <option value="institution">A company or bank</option>
                                </select>
                                <Button size="sm" className="h-10" onClick={() => void addParty()} disabled={addingParty || newParty.name.trim().length < 2} data-testid={`mpesa-debt-new-party-add-${item.index}`}>
                                  {addingParty ? "Adding…" : `Add ${newParty.name.trim() || "them"}`}
                                </Button>
                              </div>
                            ) : null}
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
                          Debt, loan, or paid through your account?
                        </button>
                      );
                    })()
                  ) : null}
                  {out && item.fee ? <p className="text-xs text-muted-foreground">+ {formatKes(item.fee)} M-Pesa charge, saved on its own</p> : null}
                </CardContent>
              </Card>
            );
          })}
          {inView.length > shownCount ? (
            <Button variant="outline" className="w-full" onClick={() => setShownCount((count) => count + LINES_PER_PAGE)} data-testid="mpesa-show-more">
              Show the next {Math.min(LINES_PER_PAGE, inView.length - shownCount)} ({inView.length - shownCount} more)
            </Button>
          ) : null}

          {summary && summary.fees > 0 ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <label className="text-sm font-semibold text-foreground" htmlFor="mpesa-charge-category">Where do the M-Pesa charges go?</label>
                <select
                  id="mpesa-charge-category"
                  className={`${SELECT_CLASS} ${chargeCategory ? "" : "border-destructive"}`}
                  value={effectiveChargeCategory}
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
              <Button variant="outline" onClick={statementReading ? startOverStatement : () => { setLines(null); setChoices({}); setStatementNote(null); setStatementReading(null); }}>Start again</Button>
              {canUndo && !saving ? (
                <Button variant="outline" onClick={undo} className="gap-2" aria-label={`Undo the last change. ${undoSteps} ${undoSteps === 1 ? "change" : "changes"} can be undone`} data-testid="mpesa-import-undo">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Undo
                </Button>
              ) : null}
              <Button onClick={() => void saveAll()} disabled={saving || !summary || summary.count === 0 || (statementReading !== null && confirmedCount === 0)} className="flex-1 gap-2" data-testid="mpesa-import-save">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {saveProgress && saveProgress.total > 0 ? (
                      <span data-testid="mpesa-save-progress">Saving {saveProgress.done} of {saveProgress.total}</span>
                    ) : null}
                  </>
                ) : (
                  statementReading
                    ? `Save ${confirmedCount} confirmed`
                    : `Save ${summary?.count ?? 0} ${summary?.count === 1 ? "entry" : "entries"}`
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
