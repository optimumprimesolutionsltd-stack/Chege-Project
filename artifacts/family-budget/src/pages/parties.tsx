/**
 * Who owes who: everybody money stands between you and.
 *
 * The phone got this screen in #285. The laptop had nowhere at all to see who
 * you owe or who owes you, let alone correct a balance typed wrong — and
 * correcting figures is exactly the job somebody sits down at a laptop for.
 *
 * Both directions sit on one person, because the schema has always held two
 * columns rather than one signed number: a chama member can owe the kitty and
 * be owed by it at once, and netting them off hides both.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Party = {
  id: number;
  name: string;
  kind?: string | null;
  owedToUs?: number | null;
  owedByUs?: number | null;
};

function formatKes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "KES 0";
  return `KES ${value.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What somebody typed into a balance box.
 *
 * Blank is not zero. Blank means the balance is not tracked; zero means it is
 * tracked and settled, which is worth being able to say and worth seeing.
 */
function readBalance(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return "invalid";
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  return toMoney(parsed);
}

export default function PartiesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const response = await fetch("/api/contributors", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load creditors and debtors.");
      return (await response.json()) as Party[];
    },
    staleTime: 30_000,
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<"person" | "institution">("person");
  const [draftOwedByUs, setDraftOwedByUs] = useState("");
  const [draftOwedToUs, setDraftOwedToUs] = useState("");

  const totals = useMemo(() => {
    let owe = 0;
    let owed = 0;
    for (const party of parties) {
      if (typeof party.owedByUs === "number") owe += party.owedByUs;
      if (typeof party.owedToUs === "number") owed += party.owedToUs;
    }
    return { owe: toMoney(owe), owed: toMoney(owed), net: toMoney(owed - owe) };
  }, [parties]);

  const creditors = parties.filter((party) => typeof party.owedByUs === "number");
  const debtors = parties.filter((party) => typeof party.owedToUs === "number");
  const untracked = parties.filter(
    (party) => typeof party.owedByUs !== "number" && typeof party.owedToUs !== "number",
  );

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraftName("");
    setDraftKind("person");
    setDraftOwedByUs("");
    setDraftOwedToUs("");
  };

  const startEdit = (party: Party) => {
    setAdding(false);
    setEditingId(party.id);
    setDraftName(party.name);
    setDraftKind(party.kind === "institution" ? "institution" : "person");
    setDraftOwedByUs(typeof party.owedByUs === "number" ? String(party.owedByUs) : "");
    setDraftOwedToUs(typeof party.owedToUs === "number" ? String(party.owedToUs) : "");
  };

  const closeDraft = () => {
    setAdding(false);
    setEditingId(null);
  };

  const saveDraft = async () => {
    const name = draftName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Who is it?", description: "Give the person or institution a name, such as Mwangi or KCB." });
      return;
    }
    const owedByUs = readBalance(draftOwedByUs);
    const owedToUs = readBalance(draftOwedToUs);
    if (owedByUs === "invalid" || owedToUs === "invalid") {
      toast({ variant: "destructive", title: "Check the balances", description: "Enter zero or more, with up to two decimals. Leave blank for not tracked." });
      return;
    }
    setBusy(true);
    try {
      // Both directions go every time, including null, so clearing a box
      // really stops tracking it rather than leaving the old figure behind.
      const body = JSON.stringify({ name, kind: draftKind, owedByUs, owedToUs });
      const response = await fetch(
        editingId === null ? "/api/contributors" : `/api/contributors/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not save.");
      }
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
      closeDraft();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const draftForm = (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="parties-draft">
      <Input
        placeholder="Name, e.g. Mwangi or KCB"
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        className="h-10 bg-card"
        data-testid="input-party-name"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={draftKind === "person" ? "default" : "outline"} onClick={() => setDraftKind("person")} data-testid="button-kind-person">
          A person
        </Button>
        <Button type="button" size="sm" variant={draftKind === "institution" ? "default" : "outline"} onClick={() => setDraftKind("institution")} data-testid="button-kind-institution">
          A bank or business
        </Button>
      </div>
      {/* Both, on one person, because somebody can be each at once. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-semibold text-foreground">I owe them</span>
          <Input
            placeholder="Blank if not tracked"
            value={draftOwedByUs}
            onChange={(event) => setDraftOwedByUs(event.target.value)}
            className="h-10 bg-card"
            data-testid="input-owed-by-us"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-semibold text-foreground">They owe me</span>
          <Input
            placeholder="Blank if not tracked"
            value={draftOwedToUs}
            onChange={(event) => setDraftOwedToUs(event.target.value)}
            className="h-10 bg-card"
            data-testid="input-owed-to-us"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Blank is not the same as zero. Blank means the balance is not tracked; zero means it is tracked and settled.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={closeDraft} data-testid="button-cancel-party">Cancel</Button>
        <Button type="button" onClick={() => void saveDraft()} disabled={busy} data-testid="button-save-party">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );

  const renderParty = (party: Party, direction: "owe" | "owed" | "none") => {
    const isBoth = typeof party.owedByUs === "number" && typeof party.owedToUs === "number";
    const figure = direction === "owe" ? party.owedByUs ?? 0 : direction === "owed" ? party.owedToUs ?? 0 : null;
    return (
      <div key={`${direction}-${party.id}`} className="space-y-2">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3" data-testid={`party-row-${party.id}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              {party.name}
              {party.kind === "institution" ? <span className="text-muted-foreground"> · institution</span> : null}
            </p>
            {isBoth ? (
              <p className="text-xs text-muted-foreground" data-testid={`party-both-${party.id}`}>
                Owes you {formatKes(party.owedToUs)} · you owe {formatKes(party.owedByUs)}
              </p>
            ) : null}
          </div>
          {figure === null ? (
            <span className="text-sm text-muted-foreground">Nothing tracked</span>
          ) : (
            <span className={direction === "owe" ? "font-bold text-destructive" : "font-bold text-emerald-600"}>
              {formatKes(figure)}
            </span>
          )}
          <Button type="button" size="icon" variant="ghost" onClick={() => (editingId === party.id ? closeDraft() : startEdit(party))} data-testid={`button-edit-party-${party.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        {editingId === party.id ? draftForm : null}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="parties-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Who owes who</h1>
        <p className="text-sm text-muted-foreground">
          Everybody money stands between you and — people and institutions alike. A loan from a bank sits here the same
          way money owed to a neighbour does.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2" data-testid="parties-totals">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">YOU OWE</p>
            <p className="text-xl font-bold text-destructive">{formatKes(totals.owe)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">OWED TO YOU</p>
            <p className="text-xl font-bold text-emerald-600">{formatKes(totals.owed)}</p>
          </div>
        </CardContent>
      </Card>
      {/* Shown, never stored: the two columns stay apart so neither is hidden. */}
      <p className="text-xs text-muted-foreground" data-testid="parties-net">
        Net: {totals.net >= 0 ? `${formatKes(totals.net)} in your favour` : `${formatKes(Math.abs(totals.net))} against you`}
      </p>

      <Button type="button" variant="outline" onClick={startAdd} data-testid="button-add-party">
        <Plus className="mr-2 h-4 w-4" /> Add somebody
      </Button>
      {adding ? draftForm : null}

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}

      {creditors.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">You owe them — creditors</CardTitle></CardHeader>
          <CardContent className="space-y-2">{creditors.map((party) => renderParty(party, "owe"))}</CardContent>
        </Card>
      ) : null}

      {debtors.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">They owe you — debtors</CardTitle></CardHeader>
          <CardContent className="space-y-2">{debtors.map((party) => renderParty(party, "owed"))}</CardContent>
        </Card>
      ) : null}

      {untracked.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">No balance tracked</CardTitle></CardHeader>
          <CardContent className="space-y-2">{untracked.map((party) => renderParty(party, "none"))}</CardContent>
        </Card>
      ) : null}

      {!isLoading && parties.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="parties-empty">
          <Users className="mr-2 inline h-4 w-4" />
          Nobody recorded yet. Add whoever you owe or whoever owes you — then paying them, or being paid, can be
          recorded on the Bank accounts page and the balance offered against it.
        </p>
      ) : null}
    </div>
  );
}
