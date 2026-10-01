import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getGetDashboardSpendingByItemQueryKey,
  useGetBudgetCategories,
  useGetDashboardSpendingByItem,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthStepper } from "@/components/month-stepper";
import { isoDay } from "@/lib/month-range";

const amount = (value: number) => value.toLocaleString("en-KE", { maximumFractionDigits: 0 });
const longDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
};
/** The first day of the month `back` months before this one. */
const monthsAgoIso = (back: number) => {
  const today = new Date();
  return isoDay(new Date(today.getFullYear(), today.getMonth() - back, 1));
};
const PRESETS = [3, 6, 12] as const;

/**
 * "How much have I spent on this?" - where "this" is a thing, not a category.
 * The phone's Spending by item (app/spending-by-item.tsx), which the web did not
 * have: what each named thing has cost, largest first, over a span you choose,
 * each one opening to the expenses behind its total.
 */
export default function SpendingByItem() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number] | "custom">(12);
  const [from, setFrom] = useState(() => monthsAgoIso(11));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"item" | "category">("item");
  const [scope, setScope] = useState<"household" | "business">("household");
  const [openItem, setOpenItem] = useState<string | null>(null);

  const { data: categories = [] } = useGetBudgetCategories();
  const hasBusiness = categories.some((row) => row.reducesIncomeSourceId != null);
  const custom = preset === "custom";
  const start = custom ? from : monthsAgoIso(preset - 1);
  const end = custom ? to : isoDay(new Date());
  const [rangeFrom, rangeTo] = start <= end ? [start, end] : [end, start];

  const query = useMemo(() => ({
    from: rangeFrom,
    to: rangeTo,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(groupBy === "category" ? { groupBy } : {}),
    scope: hasBusiness ? scope : ("household" as const),
  }), [rangeFrom, rangeTo, search, groupBy, hasBusiness, scope]);
  const { data, isLoading, isError, refetch } = useGetDashboardSpendingByItem(query, {
    query: { queryKey: getGetDashboardSpendingByItemQueryKey(query) },
  });
  const detailQuery = useMemo(() => ({ ...query, ...(openItem ? { item: openItem } : {}) }), [query, openItem]);
  const { data: detail, isLoading: detailLoading } = useGetDashboardSpendingByItem(detailQuery, {
    query: { queryKey: getGetDashboardSpendingByItemQueryKey(detailQuery), enabled: openItem !== null },
  });
  const items = data?.items ?? [];

  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted"}`;

  return (
    <div className="space-y-5 pb-12" data-testid="spending-by-item-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Spending by item</h1>
        <p className="text-sm text-muted-foreground">What each thing has cost you, largest first.</p>
      </div>

      {hasBusiness ? (
        <div className="flex gap-2" role="tablist">
          {(["household", "business"] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={chip(scope === value)} data-testid={`spending-item-scope-${value}`}>
              {value === "household" ? "Household" : "Business costs"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((months) => (
          <button key={months} type="button" onClick={() => setPreset(months)} className={chip(preset === months)} data-testid={`spending-item-preset-${months}`}>
            Last {months} months
          </button>
        ))}
        <button type="button" onClick={() => setPreset("custom")} className={chip(custom)} data-testid="spending-item-preset-custom">Exact dates</button>
      </div>
      {custom ? (
        <div className="space-y-2">
          <MonthStepper from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} testId="spending-item-month" />
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm"><span className="font-semibold">From</span><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10" /></label>
            <label className="space-y-1 text-sm"><span className="font-semibold">To</span><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10" /></label>
          </div>
        </div>
      ) : null}

      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a thing, such as Netflix" className="h-10" data-testid="spending-item-search" />
      <div className="flex gap-2" role="tablist">
        {(["item", "category"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={groupBy === value} onClick={() => { setGroupBy(value); setOpenItem(null); }} className={`flex-1 ${chip(groupBy === value)}`} data-testid={`spending-item-group-${value}`}>
            By {value}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground" data-testid="spending-item-total">{isLoading ? "Loading…" : `KES ${amount(data?.total ?? 0)}`}</p>
          <p className="text-xs text-muted-foreground">{longDay(rangeFrom)} – {longDay(rangeTo)}</p>
        </CardContent>
      </Card>

      {isError ? (
        <button type="button" onClick={() => void refetch()} className="w-full rounded-xl border p-4 text-sm text-muted-foreground">Couldn’t load this. Click to retry.</button>
      ) : items.length === 0 && !isLoading ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">Nothing spent between these dates.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const open = openItem === item.description;
            return (
              <Card key={item.description}>
                <CardContent className="p-0">
                  <button type="button" onClick={() => setOpenItem(open ? null : item.description)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left" data-testid={`spending-item-${item.description}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{item.description}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.count} {item.count === 1 ? "time" : "times"} · last {longDay(item.lastDate)}
                        {groupBy === "item" && item.categories.length > 0 ? ` · ${item.categories.join(", ")}` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-foreground">{amount(item.total)}</span>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {open ? (
                    <ul className="divide-y divide-border border-t px-4">
                      {detailLoading ? <li className="py-2.5 text-xs text-muted-foreground">Loading…</li> : null}
                      {(detail?.entries ?? []).map((entry) => (
                        <li key={`${entry.fromBank ? "b" : "e"}-${entry.id}`} className="flex items-center gap-3 py-2.5" data-testid={`spending-entry-${entry.id}`}>
                          <span className="w-28 shrink-0 text-xs text-muted-foreground">{longDay(entry.date)}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {entry.category} · {entry.payerName}{entry.fromBank ? " · from Banking" : ""}
                          </span>
                          <span className="text-sm text-foreground">{amount(entry.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
