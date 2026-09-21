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

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateDeposit,
  useCreateDisbursement,
  useGetBudgetCategories,
  useGetGroup,
  useGetJointAccount,
  useGetJointAccounts,
  getGetBudgetCategoriesQueryKey,
} from "@workspace/api-client-react";
import { buildCategoryTree, type CategoryRow } from "@workspace/category-tree";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";

type Party = { id: number; name: string; owedToUs?: number | null; owedByUs?: number | null };
type Account = { id: number; name: string };

/**
 * What a row is, in the words somebody would use for it. Direction is implied
 * rather than asked separately: nobody thinks "money out, category rent".
 */
type RowKind = "spend" | "pay-party" | "money-in" | "repaid" | "borrowed";

const KIND_LABEL: Record<RowKind, string> = {
  spend: "Spending",
  "pay-party": "Paying someone I owe",
  "money-in": "Money in",
  repaid: "Somebody paying me back",
  borrowed: "Borrowed",
};

type DayRow = {
  key: string;
  kind: RowKind;
  amount: string;
  category: string;
  partyId: string;
  description: string;
  saved: boolean;
  error: string | null;
};

function isOutgoing(kind: RowKind): boolean {
  return kind === "spend" || kind === "pay-party";
}

function formatKes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return value.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function readAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankRow(): DayRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "spend",
    amount: "",
    category: "",
    partyId: "none",
    description: "",
    saved: false,
    error: null,
  };
}

export default function BankDayPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: group } = useGetGroup();
  const isSharedWorkspace = group?.isPrivate === false;

  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [rows, setRows] = useState<DayRow[]>([blankRow()]);
  const [saving, setSaving] = useState(false);

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

  const createDeposit = useCreateDeposit();
  const createDisbursement = useCreateDisbursement();

  const categoryTree = useMemo(() => buildCategoryTree(categories as unknown as CategoryRow[]), [categories]);
  const trackedDebts = useMemo(
    () =>
      (categories as unknown as Array<{ id: number; name: string; debtBalance?: number | null }>).filter(
        (row) => typeof row.debtBalance === "number",
      ),
    [categories],
  );

  const openingBalance = account?.balance ?? 0;
  const rowEffect = (row: DayRow): number => {
    const amount = row.amount.trim() === "" ? 0 : readAmount(row.amount) ?? 0;
    return isOutgoing(row.kind) ? -amount : amount;
  };
  const unsavedRows = rows.filter((row) => !row.saved);
  const projected = openingBalance + unsavedRows.reduce((total, row) => total + rowEffect(row), 0);
  const readyCount = unsavedRows.filter((row) => {
    const amount = readAmount(row.amount);
    return amount !== null && amount > 0;
  }).length;

  const patchRow = (key: string, change: Partial<DayRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change, error: null } : row)));

  const addRow = () => setRows((current) => [...current, blankRow()]);
  const removeRow = (key: string) =>
    setRows((current) => (current.length === 1 ? [blankRow()] : current.filter((row) => row.key !== key)));

  /** What is wrong with a row, in words somebody can act on. */
  const rowProblem = (row: DayRow): string | null => {
    const amount = readAmount(row.amount);
    if (amount === null || amount <= 0) return "Give it an amount.";
    if (isOutgoing(row.kind) && !row.category.trim()) return "Give it a category.";
    if ((row.kind === "pay-party" || row.kind === "repaid") && row.partyId === "none") return "Say who.";
    if (row.kind === "borrowed" && row.partyId === "none" && !row.category.trim()) {
      return "Say what it was borrowed against, or from whom.";
    }
    return null;
  };

  const saveRow = async (row: DayRow) => {
    const amount = readAmount(row.amount) as number;
    const party = parties.find((candidate) => String(candidate.id) === row.partyId) ?? null;
    const narration = row.description.trim() || party?.name || row.category.trim() || KIND_LABEL[row.kind];

    if (isOutgoing(row.kind)) {
      await createDisbursement.mutateAsync({
        data: {
          amount,
          description: narration,
          date,
          expenseCategory: row.category.trim(),
          madeById: !isSharedWorkspace ? user?.id : null,
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
          madeById: !isSharedWorkspace ? user?.id : null,
          ...(row.kind === "repaid" && party ? { settlesContributorId: party.id } : {}),
          ...(row.kind === "borrowed" ? { isBorrowing: true } : {}),
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
      if (row.kind === "pay-party" && party) {
        const owed = typeof party.owedByUs === "number" ? party.owedByUs : 0;
        const left = Math.max(0, toMoney(owed - amount));
        changes.push({ label: `${party.name}: owe ${formatKes(owed)} → ${formatKes(left)}`, apply: patchParty("owedByUs", left, party.id) });
      } else if (row.kind === "repaid" && party) {
        const owed = typeof party.owedToUs === "number" ? party.owedToUs : 0;
        const left = Math.max(0, toMoney(owed - amount));
        changes.push({ label: `${party.name}: owes you ${formatKes(owed)} → ${formatKes(left)}`, apply: patchParty("owedToUs", left, party.id) });
      } else if (row.kind === "borrowed" && party) {
        const owed = typeof party.owedByUs === "number" ? party.owedByUs : 0;
        changes.push({ label: `${party.name}: owe ${formatKes(owed)} → ${formatKes(owed + amount)}`, apply: patchParty("owedByUs", owed + amount, party.id) });
      } else if (row.kind === "borrowed" && row.category) {
        const debt = trackedDebts.find((candidate) => candidate.name === row.category);
        if (!debt) continue;
        const owed = debt.debtBalance ?? 0;
        changes.push({
          label: `${debt.name}: ${formatKes(owed)} → ${formatKes(owed + amount)}`,
          apply: async () => {
            await fetch(`/api/budget-categories/${debt.id}`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ debtBalance: owed + amount }),
            });
          },
        });
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
      await queryClient.invalidateQueries({ queryKey: ["joint-account"] });
      await offerBalanceChanges(saved);
      toast({ title: `${saved.length} ${saved.length === 1 ? "line" : "lines"} recorded` });
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
          batch afterwards, only the day.
        </p>
      </div>

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
            <p className="text-xs text-muted-foreground">Now: {formatKes(openingBalance)}. Moves as you type.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <Card key={row.key} className={row.error ? "border-destructive" : row.saved ? "border-emerald-500" : undefined}>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-6" data-testid={`day-row-${index}`}>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-card px-2 text-sm sm:col-span-2"
                value={row.kind}
                disabled={row.saved}
                onChange={(event) => patchRow(row.key, { kind: event.target.value as RowKind, partyId: "none", category: "" })}
                data-testid={`select-day-kind-${index}`}
              >
                {(Object.keys(KIND_LABEL) as RowKind[]).map((kind) => (
                  <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                ))}
              </select>
              <Input
                value={row.amount}
                disabled={row.saved}
                onChange={(event) => patchRow(row.key, { amount: event.target.value })}
                placeholder="Amount"
                className="h-10 bg-card"
                data-testid={`input-day-amount-${index}`}
              />
              {isOutgoing(row.kind) || row.kind === "borrowed" ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={row.category}
                  disabled={row.saved}
                  onChange={(event) => patchRow(row.key, { category: event.target.value })}
                  data-testid={`select-day-category-${index}`}
                >
                  <option value="">{row.kind === "borrowed" ? "Against a debt…" : "Category…"}</option>
                  {(row.kind === "borrowed" ? trackedDebts.map((debt) => debt.name) : categoryTree.flatMap((g) => (g.children.length > 0 ? g.children : [g.name]))).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              ) : <div />}
              {row.kind !== "spend" && row.kind !== "money-in" ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={row.partyId}
                  disabled={row.saved}
                  onChange={(event) => patchRow(row.key, { partyId: event.target.value })}
                  data-testid={`select-day-party-${index}`}
                >
                  <option value="none">Who…</option>
                  {parties.map((party) => (
                    <option key={party.id} value={String(party.id)}>{party.name}</option>
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
