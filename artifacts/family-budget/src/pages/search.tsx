import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Landmark, Loader2, Search as SearchIcon, Target, TrendingUp, WalletCards } from "lucide-react";
import { useGetGroup } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatKes } from "@/lib/utils";

type SearchTab = "all" | "expenses" | "bank" | "goals" | "income";
type SearchResult = {
  id: number;
  kind: Exclude<SearchTab, "all">;
  title: string;
  subtitle: string;
  amount: number;
  date?: string | null;
  direction?: "in" | "out";
};
type SearchResponse = { query: string; tab: SearchTab; results: SearchResult[] };

const TABS: Array<{ key: SearchTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "expenses", label: "Expenses" },
  { key: "bank", label: "Bank" },
  { key: "goals", label: "Goals" },
  { key: "income", label: "Income" },
];

const destinationFor = (kind: SearchResult["kind"]) => {
  if (kind === "expenses") return "/expenses";
  if (kind === "bank") return "/bank";
  if (kind === "goals") return "/savings-goals";
  return "/budget";
};

const iconFor = (kind: SearchResult["kind"]) => {
  if (kind === "expenses") return WalletCards;
  if (kind === "bank") return Landmark;
  if (kind === "goals") return Target;
  return TrendingUp;
};

export default function SearchPage() {
  const [, navigate] = useLocation();
  const { data: group } = useGetGroup();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const normalizedQuery = query.trim();
  const search = useQuery<SearchResponse>({
    queryKey: ["workspace-search", group?.id, normalizedQuery, tab],
    queryFn: async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}&tab=${tab}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Search could not load.");
      return payload as SearchResponse;
    },
    enabled: normalizedQuery.length >= 2 && Boolean(group?.id),
  });
  const submit = () => {
    const value = draft.trim();
    if (value.length >= 2) setQuery(value);
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-28 pt-24 md:p-8 md:pt-8" data-testid="workspace-search-page">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Current budget only</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Search</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Find expenses, bank entries, goals, and income sources in {group?.name ?? "this budget"}.
        </p>
      </section>

      <Card className="space-y-4 border-primary/15 p-4 shadow-sm sm:p-5">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder='Try “Kids offering” or “rent”'
              className="h-11 pl-9"
              aria-label="Search this budget"
            />
          </div>
          <Button type="submit" disabled={draft.trim().length < 2}>Search</Button>
        </form>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Search record types">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === item.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {search.isFetching ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Searching this budget…</div>
      ) : search.isError ? (
        <Card className="p-8 text-center"><p className="font-semibold text-destructive">Search could not load</p><p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p></Card>
      ) : normalizedQuery.length < 2 ? (
        <Card className="p-10 text-center">
          <SearchIcon className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-bold">Search all your ledgers</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enter at least two letters. Results never cross into another budget.</p>
        </Card>
      ) : (search.data?.results ?? []).length === 0 ? (
        <Card className="p-10 text-center"><h2 className="text-lg font-bold">No matching records</h2><p className="mt-2 text-sm text-muted-foreground">Try a description, category, goal, or income-source name.</p></Card>
      ) : (
        <div className="space-y-3">
          {(search.data?.results ?? []).map((item) => {
            const Icon = iconFor(item.kind);
            return (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => navigate(destinationFor(item.kind))}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{item.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{item.subtitle}{item.date ? ` · ${formatDate(String(item.date))}` : ""}</span>
                </span>
                <span className={cn("shrink-0 whitespace-nowrap text-sm font-bold", item.direction === "in" ? "text-success" : "text-foreground")}>
                  {item.direction === "in" ? "+" : ""}{formatKes(Number(item.amount))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}