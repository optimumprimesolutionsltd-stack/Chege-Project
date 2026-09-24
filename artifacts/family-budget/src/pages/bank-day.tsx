/**
 * A day's banking, entered as a table.
 *
 * The posting form asks one question at a time, which is right when there is
 * one thing to record and wrong when there are eleven. Somebody working off a
 * statement knows the whole day already; what they want is to write it down
 * and watch the balance come to the figure the bank shows.
 *
 * A laptop suits this better than a phone does — a table of rows is what a day
 * actually looks like — which is why the columns are laid out rather than
 * stacked into cards the way the phone has to.
 *
 * Nothing is stored about the batch. Each row is saved as an ordinary posting
 * with the same date, and afterwards the day reads exactly as it would had it
 * been typed one at a time.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateBudgetCategory,
  useCreateDeposit,
  useCreateDisbursement,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
  getGetBudgetCategoriesQueryKey,
  getGetJointAccountQueryKey,
  getGetJointAccountsQueryKey,
} from "@workspace/api-client-react";
import { buildCategoryTree, type CategoryRow } from "@workspace/category-tree";
import { CategorySearchInput, useCategorySearch } from "@/components/category-search";
import { AmountCalcRow } from "@/components/amount-calc-row";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import { evaluateAmountExpression, isAmountExpression } from "@/lib/amount-expression";
import { balanceAsAt } from "@/lib/balance-as-at";

type Party = { id: number; name: string; owedToUs?: number | null; owedByUs?: number | null };
type Account = { id: number; name: string };

/**
 * What a row is, in the words somebody would use for it. Direction is implied
 * rather than asked separately: nobody thinks "money out, category rent".
 */
type RowKind = "spend" | "pay-party" | "money-in" | "repaid" | "borrowed" | "lend";

const KIND_LABEL: Record<RowKind, string> = {
  spend: "Spending",
  "pay-party": "Paying someone I owe",
  "money-in": "Money in",
  repaid: "Somebody paying me back",
  borrowed: "Borrowed",
  lend: "Lending",
};

/**
 * One fee on a row, posted separately. A statement line is often more than one
 * charge - a withdrawal fee and excise duty on the same entry - so a row
 * carries a list. The label is what the posting is called; left blank it falls
 * back to "Bank charge - <what the row was>".
 */
type ChargeItem = { key: string; amount: string; category: string; label: string };

type DayRow = {
  key: string;
  kind: RowKind;
  amount: string;
  category: string;
  partyId: string;
  /** For ordinary money in: which income stream it came from ("none" = not said). */
  incomeSourceId: string;
  description: string;
  charges: ChargeItem[];
  saved: boolean;
  error: string | null;
};

/** Which way the money runs. The fee always runs out, whatever the row does. */
function isOutgoing(kind: RowKind): boolean {
  return kind === "spend" || kind === "pay-party" || kind === "lend";
}

/** Only money going out can carry a bank charge; money coming in never does. */
function chargesOf<T extends { kind: RowKind; charges: ChargeItem[] }>(row: T): ChargeItem[] {
  return isOutgoing(row.kind) ? row.charges : [];
}

function formatKes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return value.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A plain amount, or a sum such as 500+250 (the phone's calculator keys, typed). */
function readAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const evaluated = normalized === "" ? null : evaluateAmountExpression(value);
  return evaluated !== null && Number.isFinite(evaluated) && evaluated >= 0 ? toMoney(evaluated) : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shared with the posting form: a bank charge is the same expense every time. */
const CHARGE_CATEGORY_KEY = "jamvi:last-charge-category";

function blankCharge(category: string): ChargeItem {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, amount: "", category, label: "" };
}

function blankRow(chargeCategory = ""): DayRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "spend",
    amount: "",
    category: "",
    partyId: "none",
    incomeSourceId: "none",
    description: "",
    // Always at least one, blank, so the amount beside the main figure has
    // something to bind to - an unused blank charge posts nothing.
    charges: [blankCharge(chargeCategory)],
    saved: false,
    error: null,
  };
}

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-card px-2 text-sm";
const NEW_CATEGORY = "__new_category__";
const NEW_PARTY = "__new_party__";

/**
 * A category picker that can also make one on the spot, so a line is never
 * blocked on leaving the page to create the category it needs. New ones go at
 * the top level, or under a group when one is chosen - never a second level,
 * since the server refuses that anyway.
 */
function CategoryField({
  value,
  disabled,
  tree,
  names,
  groups,
  onPick,
  placeholder,
  testId,
}: {
  value: string;
  disabled: boolean;
  tree: ReturnType<typeof buildCategoryTree>;
  names: string[];
  groups: Array<{ id: number; name: string }>;
  onPick: (name: string) => void;
  placeholder: string;
  testId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createCategory = useCreateBudgetCategory();
  const search = useCategorySearch(tree);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("none");
  const [newBudget, setNewBudget] = useState("");

  const submit = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Name it", description: "Give this category a clear name, such as Transport or Childcare." });
      return;
    }
    if (names.some((existing) => existing.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast({ variant: "destructive", title: "Already exists", description: "Pick it from the list instead." });
      return;
    }
    const budgetAmount = newBudget.trim() === "" ? 0 : Number(newBudget);
    if (!Number.isInteger(budgetAmount) || budgetAmount < 0) {
      toast({ variant: "destructive", title: "Enter a valid monthly budget", description: "Use a whole number of KES, or leave it blank." });
      return;
    }
    try {
      const created = await createCategory.mutateAsync({
        data: {
          name,
          budgetAmount,
          priority: 3,
          isRecurring: true,
          activeMonth: null,
          activeYear: null,
          ...(newParent !== "none" ? { parentId: Number(newParent) } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
      onPick(created.name);
      setNewName("");
      setNewParent("none");
      setNewBudget("");
      setAdding(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add it", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  if (adding) {
    return (
      <div className="space-y-2 rounded-md border border-input p-2" data-testid={`${testId}-new`}>
        <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New category name" className="h-9 bg-card" data-testid={`${testId}-new-name`} />
        <select className={SELECT_CLASS} value={newParent} onChange={(event) => setNewParent(event.target.value)} data-testid={`${testId}-new-parent`}>
          <option value="none">Not inside a group</option>
          {groups.map((group) => (
            <option key={group.id} value={String(group.id)}>Inside {group.name}</option>
          ))}
        </select>
        <Input value={newBudget} onChange={(event) => setNewBudget(event.target.value)} placeholder="Monthly budget (optional)" inputMode="numeric" className="h-9 bg-card" />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void submit()} disabled={createCategory.isPending} data-testid={`${testId}-new-save`}>
            {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add category"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
    <CategorySearchInput query={search.query} onChange={search.setQuery} testId={`${testId}-search`} />
    <select
      className={SELECT_CLASS}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value === NEW_CATEGORY) setAdding(true);
        else onPick(event.target.value);
      }}
      data-testid={testId}
    >
      <option value="">{placeholder}</option>
      {search.visible(value).flatMap((group) => (group.children.length > 0 ? group.children : [group.name])).map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
      <option value={NEW_CATEGORY}>＋ New category…</option>
    </select>
    </div>
  );
}

/**
 * A person picker that can also add one on the spot, with what is already owed
 * on the side this row is about (what we owe them, or what they owe us).
 */
function PartyField({
  value,
  disabled,
  parties,
  owedField,
  onPick,
  placeholder,
  testId,
}: {
  value: string;
  disabled: boolean;
  parties: Party[];
  owedField: "owedByUs" | "owedToUs";
  onPick: (id: string) => void;
  placeholder: string;
  testId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOwed, setNewOwed] = useState("");
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Who is it?", description: "Give the person or institution a name, such as Mwangi or KCB." });
      return;
    }
    const owed = newOwed.trim() === "" ? 0 : readAmount(newOwed);
    if (owed === null || owed < 0) {
      toast({ variant: "destructive", title: "What is owed?", description: "Enter zero or more, with up to two decimal places." });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/contributors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, [owedField]: toMoney(owed) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error);
      }
      const created = (await response.json()) as { id: number };
      // Awaited: onPick fires right after, and the list has to carry this
      // person by the time anything reads it back.
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
      onPick(String(created.id));
      setNewName("");
      setNewOwed("");
      setAdding(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add them", description: error instanceof Error && error.message ? error.message : "Please try again." });
    } finally {
      setCreating(false);
    }
  };

  if (adding) {
    return (
      <div className="space-y-2 rounded-md border border-input p-2" data-testid={`${testId}-new`}>
        <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Name, e.g. Mwangi or KCB" className="h-9 bg-card" data-testid={`${testId}-new-name`} />
        <Input
          value={newOwed}
          onChange={(event) => setNewOwed(event.target.value)}
          placeholder={owedField === "owedByUs" ? "What you owe them (optional)" : "What they owe you (optional)"}
          inputMode="decimal"
          className="h-9 bg-card"
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void submit()} disabled={creating} data-testid={`${testId}-new-save`}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <select
      className={SELECT_CLASS}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value === NEW_PARTY) setAdding(true);
        else onPick(event.target.value);
      }}
      data-testid={testId}
    >
      <option value="none">{placeholder}</option>
      {parties.map((party) => (
        <option key={party.id} value={String(party.id)}>{party.name}</option>
      ))}
      <option value={NEW_PARTY}>＋ Add someone…</option>
    </select>
  );
}

export default function BankDayPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;

  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState<number | null>(null);
  // The category every fee on this day goes to, remembered across sittings so
  // the month's charges total instead of scattering.
  const [chargeCategory, setChargeCategory] = useState("");
  const [rows, setRows] = useState<DayRow[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  // What the last save recorded, shown over the fresh form that follows it.
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHARGE_CATEGORY_KEY);
      if (!stored) return;
      setChargeCategory(stored);
      // Fill it into charges that have not been given a category yet.
      setRows((current) => current.map((row) => ({
        ...row,
        charges: row.charges.map((charge) => (charge.category === "" ? { ...charge, category: stored } : charge)),
      })));
    } catch {
      /* private mode: the category just is not remembered */
    }
  }, []);

  const { data: accountList = [] } = useGetJointAccounts();
  const accounts = accountList as unknown as Account[];
  const activeAccountId = accountId ?? accounts[0]?.id ?? null;
  const { data: account } = useGetJointAccount(activeAccountId ? { accountId: activeAccountId } : undefined);
  const { data: categories = [] } = useGetBudgetCategories();
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load creditors and debtors.");
      return (await response.json()) as Party[];
    },
    staleTime: 30_000,
  });
  // Whose income streams to offer on money in: the person's own in a Personal
  // budget, the group's in a shared one (deposits there go to the joint bank).
  const { data: incomeSources = [] } = useQuery<{ id: number; name: string; userId?: string | null }[]>({
    queryKey: ["income-sources", !isSharedWorkspace ? user?.id ?? "__me__" : "__group__"],
    queryFn: async () => {
      const url = !isSharedWorkspace && user?.id ? `/api/income-sources?userId=${encodeURIComponent(user.id)}` : "/api/income-sources";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load income sources.");
      return response.json();
    },
    staleTime: 30_000,
  });

  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();

  const categoryTree = useMemo(() => buildCategoryTree(categories as unknown as CategoryRow[]), [categories]);
  const categoryNames = useMemo(() => (categories as unknown as Array<{ name: string }>).map((row) => row.name), [categories]);
  // Top-level categories a new one can be filed under.
  const categoryGroups = useMemo(
    () => (categories as unknown as Array<{ id: number; name: string; parentId?: number | null }>)
      .filter((row) => !row.parentId)
      .map((row) => ({ id: row.id, name: row.name })),
    [categories],
  );
  const trackedDebts = useMemo(
    () =>
      (categories as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>).filter(
        (row) => typeof row.debtBalance === "number",
      ),
    [categories],
  );

  // The account as it stood at the end of the chosen day, so changing the date
  // changes the figure. Postings already saved on that day are in it.
  const openingBalance = balanceAsAt(account as never, date);
  const chargeAmount = (charge: ChargeItem): number => (charge.amount.trim() === "" ? 0 : readAmount(charge.amount) ?? 0);
  /** What each row moves, in the direction it moves it, every charge included. */
  const rowEffect = (row: DayRow): number => {
    const amount = row.amount.trim() === "" ? 0 : readAmount(row.amount) ?? 0;
    const fees = chargesOf(row).reduce((total, charge) => total + chargeAmount(charge), 0);
    return (isOutgoing(row.kind) ? -amount : amount) - fees;
  };
  const unsavedRows = rows.filter((row) => !row.saved);
  const projected = openingBalance + unsavedRows.reduce((total, row) => total + rowEffect(row), 0);
  const readyCount = unsavedRows.filter((row) => {
    const amount = readAmount(row.amount);
    return amount !== null && amount > 0;
  }).length;

  const patchRow = (key: string, change: Partial<DayRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change, error: null } : row)));

  const addRow = () => setRows((current) => [...current, blankRow(chargeCategory)]);
  const removeRow = (key: string) =>
    setRows((current) => (current.length === 1 ? [blankRow(chargeCategory)] : current.filter((row) => row.key !== key)));

  const addCharge = (rowKey: string) =>
    setRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, charges: [...row.charges, blankCharge(chargeCategory)] } : row)),
    );
  const removeCharge = (rowKey: string, chargeKey: string) =>
    setRows((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, charges: row.charges.filter((charge) => charge.key !== chargeKey) } : row)),
    );
  const patchCharge = (rowKey: string, chargeKey: string, change: Partial<ChargeItem>) =>
    setRows((current) =>
      current.map((row) =>
        row.key === rowKey
          ? { ...row, charges: row.charges.map((charge) => (charge.key === chargeKey ? { ...charge, ...change } : charge)), error: null }
          : row,
      ),
    );
  const rememberChargeCategory = (rowKey: string, chargeKey: string, name: string) => {
    setChargeCategory(name);
    patchCharge(rowKey, chargeKey, { category: name });
    try {
      window.localStorage.setItem(CHARGE_CATEGORY_KEY, name);
    } catch {
      /* not remembered */
    }
  };

  /** What is wrong with a row, in words somebody can act on. */
  const rowProblem = (row: DayRow): string | null => {
    const amount = readAmount(row.amount);
    if (amount === null || amount <= 0) return "Give it an amount.";
    // A loan out has no category, because it is not a cost.
    if (isOutgoing(row.kind) && row.kind !== "lend" && !row.category.trim()) return "Give it a category.";
    if ((row.kind === "pay-party" || row.kind === "repaid") && row.partyId === "none") return "Say who.";
    if (row.kind === "lend" && row.partyId === "none") return "Say who you are lending to.";
    if (row.kind === "borrowed" && row.partyId === "none" && !row.category.trim()) {
      return "Say what it was borrowed against, or from whom.";
    }
    for (const charge of chargesOf(row)) {
      if (charge.amount.trim() === "") continue;
      const fee = readAmount(charge.amount);
      if (fee === null || fee < 0) return "Check the bank charge.";
      if (fee > 0 && !charge.category.trim()) return "Give the bank charge a category.";
    }
    return null;
  };

  /**
   * Save one row, then each of its charges as its own posting, in the order
   * written, so a failure stops at a known point rather than leaving a hole.
   */
  const saveRow = async (row: DayRow) => {
    const amount = readAmount(row.amount) as number;
    const party = parties.find((candidate) => String(candidate.id) === row.partyId) ?? null;
    const narration = row.description.trim() || party?.name || row.category.trim() || KIND_LABEL[row.kind];
    const madeById = !isSharedWorkspace ? user?.id : null;

    if (row.kind === "lend") {
      await createDisbursement.mutateAsync({
        data: {
          amount,
          description: narration,
          date,
          madeById,
          isLending: true,
          settlesContributorId: party?.id,
          accountId: activeAccountId ?? undefined,
        },
      });
    } else if (isOutgoing(row.kind)) {
      await createDisbursement.mutateAsync({
        data: {
          amount,
          description: narration,
          date,
          expenseCategory: row.category.trim(),
          madeById,
          destinationKind: "category",
          accountId: activeAccountId ?? undefined,
        },
      });
    } else {
      await createDeposit.mutateAsync({
        data: {
          amount,
          description: narration,
          date,
          // A source belongs to one member, and the server only accepts it
          // when the deposit names that same member.
          madeById: row.kind === "money-in" && row.incomeSourceId !== "none"
            ? incomeSources.find((source) => String(source.id) === row.incomeSourceId)?.userId ?? madeById
            : madeById,
          ...(row.kind === "repaid" && party ? { settlesContributorId: party.id } : {}),
          ...(row.kind === "borrowed" ? { isBorrowing: true } : {}),
          ...(row.kind === "money-in" && row.incomeSourceId !== "none" ? { incomeSourceId: Number(row.incomeSourceId) } : {}),
          accountId: activeAccountId ?? undefined,
        },
      });
    }

    for (const charge of chargesOf(row)) {
      const fee = chargeAmount(charge);
      if (fee <= 0) continue;
      await createDisbursement.mutateAsync({
        data: {
          amount: fee,
          description: charge.label.trim() || `Bank charge — ${narration}`,
          date,
          expenseCategory: charge.category.trim(),
          madeById,
          destinationKind: "category",
          accountId: activeAccountId ?? undefined,
        },
      });
    }
  };

  /**
   * The balances, offered once at the end. Asking after every line is not a
   * question but a wall, and they are still offered rather than applied since
   * the postings can be edited or deleted afterwards.
   */
  const offerBalanceChanges = async (saved: DayRow[]) => {
    const changes: Array<{ label: string; apply: () => Promise<void> }> = [];
    for (const row of saved) {
      const amount = toMoney(readAmount(row.amount) ?? 0);
      if (amount <= 0) continue;
      const party = parties.find((candidate) => String(candidate.id) === row.partyId) ?? null;
      const patchParty = (field: "owedByUs" | "owedToUs", value: number, id: number) => async () => {
        await fetch(`/api/contributors/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
      };
      const patchDebt = (id: number, value: number) => async () => {
        await fetch(`/api/budget-categories/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ debtBalance: value }),
        });
      };
      if (row.kind === "pay-party" && party) {
        const owed = typeof party.owedByUs === "number" ? party.owedByUs : 0;
        const left = Math.max(0, toMoney(owed - amount));
        changes.push({ label: `${party.name}: owe ${formatKes(owed)} → ${formatKes(left)}`, apply: patchParty("owedByUs", left, party.id) });
      } else if (row.kind === "repaid" && party) {
        const owed = typeof party.owedToUs === "number" ? party.owedToUs : 0;
        const left = Math.max(0, toMoney(owed - amount));
        changes.push({ label: `${party.name}: owes you ${formatKes(owed)} → ${formatKes(left)}`, apply: patchParty("owedToUs", left, party.id) });
      } else if (row.kind === "lend" && party) {
        const owed = typeof party.owedToUs === "number" ? party.owedToUs : 0;
        changes.push({ label: `${party.name}: owes you ${formatKes(owed)} → ${formatKes(owed + amount)}`, apply: patchParty("owedToUs", toMoney(owed + amount), party.id) });
      } else if (row.kind === "borrowed" && party) {
        const owed = typeof party.owedByUs === "number" ? party.owedByUs : 0;
        changes.push({ label: `${party.name}: owe ${formatKes(owed)} → ${formatKes(owed + amount)}`, apply: patchParty("owedByUs", toMoney(owed + amount), party.id) });
      } else if (row.kind === "borrowed" && row.category) {
        const debt = trackedDebts.find((candidate) => candidate.name === row.category);
        if (!debt) continue;
        const owed = debt.debtBalance ?? 0;
        changes.push({ label: `${debt.name}: ${formatKes(owed)} → ${formatKes(owed + amount)}`, apply: patchDebt(debt.id, owed + amount) });
      } else if (row.kind === "spend") {
        // Spending against a debt category pays it down.
        const debt = trackedDebts.find(
          (candidate) => candidate.name.trim().toLocaleLowerCase() === row.category.trim().toLocaleLowerCase(),
        );
        if (!debt) continue;
        const owed = debt.debtBalance ?? 0;
        if (owed <= 0) continue;
        const left = Math.max(0, toMoney(owed - amount));
        changes.push({ label: `${debt.name}: ${formatKes(owed)} → ${formatKes(left)}`, apply: patchDebt(debt.id, left) });
      }
    }
    if (changes.length === 0) return;
    const question =
      `${changes.length === 1 ? "Update this balance too?" : `Update ${changes.length} balances too?`}\n\n` +
      `${changes.map((change) => `· ${change.label}`).join("\n")}\n\n` +
      `The postings are already saved either way.`;
    if (!window.confirm(question)) return;
    for (const change of changes) await change.apply();
    await queryClient.invalidateQueries({ queryKey: ["parties"] });
    await queryClient.invalidateQueries({ queryKey: getGetBudgetCategoriesQueryKey() });
  };

  const saveAll = async () => {
    if (!activeAccountId) {
      toast({ variant: "destructive", title: "Which account?", description: "Choose the account this day belongs to." });
      return;
    }
    const pending = rows.filter((row) => !row.saved && row.amount.trim() !== "");
    if (pending.length === 0) {
      toast({ variant: "destructive", title: "Nothing to save", description: "Fill in at least one line." });
      return;
    }
    for (const row of pending) {
      const problem = rowProblem(row);
      if (problem) {
        patchRow(row.key, { error: problem });
        toast({ variant: "destructive", title: "One line is not ready", description: problem });
        return;
      }
    }

    setSaving(true);
    const saved: DayRow[] = [];
    try {
      for (const row of pending) {
        try {
          await saveRow(row);
          saved.push(row);
          // Marked one at a time: a failure half way leaves what was written
          // written, and what was not still on screen to try again.
          setRows((current) => current.map((candidate) => (candidate.key === row.key ? { ...candidate, saved: true } : candidate)));
        } catch (error) {
          const message = error instanceof Error ? error.message : "It was not recorded.";
          setRows((current) => current.map((candidate) => (candidate.key === row.key ? { ...candidate, error: message } : candidate)));
          toast({
            variant: "destructive",
            title: saved.length === 0 ? "Nothing was saved" : `${saved.length} saved, then this one stopped`,
            description: `${message} What saved is saved. The rest is still here.`,
          });
          return;
        }
      }
      // The generated query keys, not a hand-written one: "joint-account" never
      // matched "/api/joint-account", so the balance above went stale after
      // every save.
      await queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetJointAccountsQueryKey() });
      await offerBalanceChanges(saved);
      const recorded = `${saved.length} ${saved.length === 1 ? "line" : "lines"} recorded`;
      toast({ title: recorded });
      // Everything on screen is saved: start the next entry from a clean line
      // instead of leaving a finished, greyed-out form to work around.
      setRows((current) => (current.every((candidate) => candidate.saved) ? [blankRow(chargeCategory)] : current));
      setLastRecorded(recorded);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="bank-day-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">A day of banking</h1>
        <p className="text-sm text-muted-foreground">
          Write the day down line by line, then save it in one go. Each line becomes an ordinary posting — there is no
          batch afterwards, only the day. Amounts can be sums, such as 500+250.
        </p>
      </div>

      {lastRecorded ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500" data-testid="day-last-recorded">
          {lastRecorded}. The balance above includes them — add the next line below.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Date</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 bg-card" data-testid="input-day-date" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-foreground">Account</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base"
              value={activeAccountId ?? ""}
              onChange={(event) => setAccountId(Number(event.target.value))}
              data-testid="select-day-account"
            >
              {accounts.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </label>
          <div className="space-y-1 text-sm" data-testid="day-balance">
            <span className="font-semibold text-foreground">After this day</span>
            <p className={projected < 0 ? "text-xl font-bold text-destructive" : "text-xl font-bold text-foreground"} data-testid="day-projected">
              {formatKes(projected)}
            </p>
            <p className="text-xs text-muted-foreground">On {new Date(`${date}T12:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}: {formatKes(openingBalance)}. Moves as you type, fees included.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <Card key={row.key} className={row.error ? "border-destructive" : row.saved ? "border-emerald-500" : undefined}>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-6" data-testid={`day-row-${index}`}>
              <select
                className={`${SELECT_CLASS} sm:col-span-2`}
                value={row.kind}
                disabled={row.saved}
                onChange={(event) => patchRow(row.key, { kind: event.target.value as RowKind, partyId: "none", category: "", incomeSourceId: "none" })}
                data-testid={`select-day-kind-${index}`}
              >
                {(Object.keys(KIND_LABEL) as RowKind[]).map((kind) => (
                  <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                ))}
              </select>
              <div>
                <Input
                  value={row.amount}
                  disabled={row.saved}
                  onChange={(event) => patchRow(row.key, { amount: event.target.value })}
                  placeholder="Amount"
                  className="h-10 bg-card"
                  data-testid={`input-day-amount-${index}`}
                />
                <AmountCalcRow value={row.amount} onChange={(next) => patchRow(row.key, { amount: next })} disabled={row.saved} testId={`day-amount-${index}`} />
              </div>
              {(isOutgoing(row.kind) && row.kind !== "lend") || row.kind === "borrowed" ? (
                row.kind === "borrowed" ? (
                  <select
                    className={SELECT_CLASS}
                    value={row.category}
                    disabled={row.saved}
                    onChange={(event) => patchRow(row.key, { category: event.target.value })}
                    data-testid={`select-day-category-${index}`}
                  >
                    <option value="">Against a debt…</option>
                    {trackedDebts.map((debt) => (
                      <option key={debt.id} value={debt.name}>{debt.name}</option>
                    ))}
                  </select>
                ) : (
                  <CategoryField
                    value={row.category}
                    disabled={row.saved}
                    tree={categoryTree}
                    names={categoryNames}
                    groups={categoryGroups}
                    onPick={(name) => patchRow(row.key, { category: name })}
                    placeholder="Category…"
                    testId={`select-day-category-${index}`}
                  />
                )
              ) : <div />}
              {row.kind !== "spend" && row.kind !== "money-in" ? (
                <PartyField
                  value={row.partyId}
                  disabled={row.saved}
                  parties={parties}
                  owedField={row.kind === "pay-party" || row.kind === "borrowed" ? "owedByUs" : "owedToUs"}
                  onPick={(id) => patchRow(row.key, { partyId: id })}
                  placeholder={row.kind === "lend" ? "Who you are lending to…" : row.kind === "borrowed" ? "Who lent it…" : "Who…"}
                  testId={`select-day-party-${index}`}
                />
              ) : row.kind === "money-in" && incomeSources.length > 0 ? (
                <select
                  className={SELECT_CLASS}
                  value={row.incomeSourceId}
                  disabled={row.saved}
                  onChange={(event) => patchRow(row.key, { incomeSourceId: event.target.value })}
                  aria-label="Where did this money come from?"
                  data-testid={`select-day-income-source-${index}`}
                >
                  <option value="none">Where from? (optional)</option>
                  {incomeSources.map((source) => (
                    <option key={source.id} value={String(source.id)}>{source.name}</option>
                  ))}
                </select>
              ) : <div />}
              <div className="flex items-center gap-2">
                <Input
                  value={row.description}
                  disabled={row.saved}
                  onChange={(event) => patchRow(row.key, { description: event.target.value })}
                  placeholder="Note"
                  className="h-10 bg-card"
                  data-testid={`input-day-note-${index}`}
                />
                {!row.saved && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(row.key)} data-testid={`button-day-remove-${index}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Bank charges: a statement line often carries a withdrawal fee,
                  excise duty, a Fuliza fee. Each is its own posting, named and
                  filed under its own category. */}
              {isOutgoing(row.kind) ? (
              <div className="space-y-2 sm:col-span-6" data-testid={`day-charges-${index}`}>
                {row.charges.map((charge, chargeIndex) => (
                  <div key={charge.key} className="grid gap-2 sm:grid-cols-6">
                    <div>
                      <Input
                        value={charge.amount}
                        disabled={row.saved}
                        onChange={(event) => patchCharge(row.key, charge.key, { amount: event.target.value })}
                        placeholder="Bank charge"
                        className="h-9 bg-card"
                        data-testid={`input-day-charge-amount-${index}-${chargeIndex}`}
                      />
                      <AmountCalcRow value={charge.amount} onChange={(next) => patchCharge(row.key, charge.key, { amount: next })} disabled={row.saved} testId={`day-charge-${index}-${chargeIndex}`} />
                    </div>
                    <div className="sm:col-span-2">
                      <CategoryField
                        value={charge.category}
                        disabled={row.saved}
                        tree={categoryTree}
                        names={categoryNames}
                        groups={categoryGroups}
                        onPick={(name) => rememberChargeCategory(row.key, charge.key, name)}
                        placeholder="Charge category…"
                        testId={`select-day-charge-category-${index}-${chargeIndex}`}
                      />
                    </div>
                    <Input
                      value={charge.label}
                      disabled={row.saved}
                      onChange={(event) => patchCharge(row.key, charge.key, { label: event.target.value })}
                      placeholder="Name it (e.g. Fuliza)"
                      className="h-9 bg-card sm:col-span-2"
                      data-testid={`input-day-charge-label-${index}-${chargeIndex}`}
                    />
                    {!row.saved && row.charges.length > 1 ? (
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeCharge(row.key, charge.key)} data-testid={`button-day-charge-remove-${index}-${chargeIndex}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : <div />}
                  </div>
                ))}
                {!row.saved ? (
                  <button
                    type="button"
                    onClick={() => addCharge(row.key)}
                    className="text-xs font-semibold text-primary hover:underline"
                    data-testid={`button-day-add-charge-${index}`}
                  >
                    ＋ Add another charge
                  </button>
                ) : null}
              </div>
              ) : null}

              {row.error ? <p className="text-xs text-destructive sm:col-span-6" data-testid={`day-row-error-${index}`}>{row.error}</p> : null}
              {row.saved ? <p className="text-xs text-emerald-600 sm:col-span-6">Saved.</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={addRow} data-testid="button-day-add-row">
          <Plus className="mr-2 h-4 w-4" /> Add a line
        </Button>
        <Button type="button" onClick={() => void saveAll()} disabled={saving || readyCount === 0} data-testid="button-day-save-all">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${readyCount} ${readyCount === 1 ? "line" : "lines"}`}
        </Button>
      </div>
    </div>
  );
}
