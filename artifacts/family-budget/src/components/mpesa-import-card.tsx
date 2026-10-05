import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Smartphone } from "lucide-react";
import { useGetGroup } from "@workspace/api-client-react";
import type { EntryToSort } from "@/lib/entries-to-sort";
import { readMpesaCard, rememberMpesaCard, shouldShowMpesaCard } from "@/lib/mpesa-card";

/**
 * Your M-Pesa, first thing on Home and always there.
 *
 * M-Pesa is what people open Jamvi for, so the home screen leads with it: what
 * came in and went out through M-Pesa this month, when it was last brought in,
 * what is still waiting to be sorted, and one tap to bring more in. Before the
 * first import it carries the short explanation instead of figures; "Not now"
 * folds that explanation away but leaves the panel and its button in place.
 */

interface MpesaSummary {
  month: number;
  year: number;
  imported: boolean;
  latestDate: string | null;
  entries: number;
  moneyIn: number;
  moneyOut: number;
  /** The M-Pesa account's balance as Jamvi has it today - to check against the M-Pesa app. */
  balance?: number | null;
  balanceAccount?: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
};

export function MpesaImportCard() {
  const [introOpen, setIntroOpen] = useState(() => shouldShowMpesaCard(readMpesaCard()));
  const { data: group } = useGetGroup();
  const canImport = group?.role !== "viewer";

  const { data: summary } = useQuery<MpesaSummary>({
    queryKey: ["mpesa-summary"],
    queryFn: async () => {
      const response = await fetch("/api/mpesa/summary", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the M-Pesa summary.");
      return response.json();
    },
    staleTime: 60_000,
    retry: false,
  });
  // Same query the dashboard's own "Not sure" card reads, so one request serves both.
  const { data: toSort } = useQuery<{ entries: EntryToSort[] }>({
    queryKey: ["entries-to-sort"],
    queryFn: async () => {
      const response = await fetch("/api/entries-to-sort", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load entries to sort.");
      return response.json();
    },
    staleTime: 60_000,
    retry: false,
  });
  const toSortCount = toSort?.entries.length ?? 0;

  const monthName = MONTHS[(summary?.month ?? new Date().getMonth() + 1) - 1];
  const showIntro = introOpen && !summary?.imported;

  return (
    <section
      aria-labelledby="mpesa-panel-heading"
      data-testid="mpesa-home-card"
      className="overflow-hidden rounded-lg bg-[hsl(var(--jade))] text-[hsl(var(--paper))] shadow-[6px_6px_0_hsl(var(--clay-bright))]"
    >
      <div className="weave-thin" aria-hidden="true" />
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="mpesa-panel-heading" className="kicker text-[hsl(var(--sisal))]">
            YOUR M-PESA · {monthName.toUpperCase()}
          </h2>
          {summary?.latestDate ? (
            <p className="font-mono text-xs text-[hsl(var(--paper))]/70">Latest entry {shortDate(summary.latestDate)}</p>
          ) : null}
        </div>

        {showIntro ? (
          <div className="space-y-2">
            <p className="font-display text-2xl font-bold leading-tight sm:text-3xl">Your M-Pesa month, sorted in minutes</p>
            <p className="max-w-2xl text-sm leading-relaxed text-[hsl(var(--paper))]/80">
              Import your M-Pesa statement or paste your messages, and Jamvi fills in what you spent, on what and who paid you.
              A statement is read on your computer and never uploaded.
            </p>
          </div>
        ) : (
          <>
          {summary?.balance != null ? (
            <div data-testid="mpesa-home-card-balance">
              <p className="text-xs text-[hsl(var(--paper))]/70">{summary.balanceAccount ? `${summary.balanceAccount} balance in Jamvi` : "M-Pesa balance in Jamvi"}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">{kes(summary.balance)}</p>
              <p className="text-xs text-[hsl(var(--paper))]/70">Check it matches your M-Pesa app. If not, import the statement to find the difference.</p>
            </div>
          ) : null}
          <dl className="grid grid-cols-3 gap-3 border-t border-dashed border-[hsl(var(--sisal))]/35 pt-4">
            {[
              { label: "Into M-Pesa", value: summary ? kes(summary.moneyIn) : "…" },
              { label: "Left M-Pesa", value: summary ? kes(summary.moneyOut) : "…" },
              { label: "Entries", value: summary ? String(summary.entries) : "…" },
            ].map((figure) => (
              <div key={figure.label} className="min-w-0">
                <dt className="text-xs text-[hsl(var(--paper))]/70">{figure.label}</dt>
                <dd className="mt-1 truncate font-mono text-base font-semibold tabular-nums sm:text-2xl">{figure.value}</dd>
              </div>
            ))}
          </dl>
          {/* What they count, so they are not read as spending (5 Oct 2026). */}
          <p className="text-xs text-[hsl(var(--paper))]/70">All money in and out of M-Pesa, savings, transfers and repayments included. What you spent is under Spent on your budget.</p>
          </>
        )}

        {!showIntro && summary && summary.entries === 0 ? (
          <p className="text-sm text-[hsl(var(--paper))]/80">
            Nothing from M-Pesa saved for {monthName} yet. Bring in your messages or statement and this fills in.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {canImport ? (
            <Link
              href="/mpesa-import"
              onClick={() => { if (showIntro) rememberMpesaCard("done"); }}
              data-testid="mpesa-home-card-open"
              className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[hsl(var(--sisal))] px-5 text-sm font-bold text-[hsl(var(--ink))] shadow-[3px_3px_0_hsl(var(--ink)/0.5)] hover:brightness-105"
            >
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              {summary?.imported ? "Bring in more M-Pesa" : "Import my M-Pesa"}
            </Link>
          ) : null}
          {toSortCount > 0 && canImport ? (
            <Link href="/sort-entries" className="inline-flex items-center gap-1 text-sm font-bold underline decoration-[hsl(var(--sisal))] decoration-2 underline-offset-4">
              Sort {toSortCount} {toSortCount === 1 ? "entry" : "entries"} saved as Not sure <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
          {showIntro ? (
            <button
              type="button"
              onClick={() => { rememberMpesaCard("dismissed"); setIntroOpen(false); }}
              data-testid="mpesa-home-card-later"
              className="text-sm font-bold text-[hsl(var(--paper))]/75 hover:text-[hsl(var(--paper))]"
            >
              Not now
            </button>
          ) : null}
        </div>

        <p className="text-xs text-[hsl(var(--paper))]/60">
          On Android, the Jamvi app reads your M-Pesa messages if you allow it.
        </p>
      </div>
    </section>
  );
}
