import type { LucideIcon } from "lucide-react";
import { ArrowRight, FileText, Landmark, Megaphone, PieChart, Target, Users, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { formatKes } from "@/lib/utils";

/**
 * The home page as a set of summaries, not a wall of figures: one small card
 * per area with a single line of status and a link to the full page. Bump
 * ANNOUNCEMENT.id whenever the message changes so a dismissed bar comes back.
 */
const ANNOUNCEMENT = {
  id: "2026-09-report-verification",
  text: "New — download the monthly contribution report as a PDF or send it to WhatsApp, each carrying a link members can use to check it is genuine.",
  href: "/contributions",
  cta: "Open Contributions",
};
const DISMISS_KEY = "jamvi:dismissed-announcement";

export function DashboardAnnouncement() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === ANNOUNCEMENT.id;
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, ANNOUNCEMENT.id);
    } catch {
      /* a private window can refuse storage; hiding it for the session is enough */
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] p-3.5 sm:items-center">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Megaphone className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
        {ANNOUNCEMENT.text}{" "}
        <Link
          href={ANNOUNCEMENT.href}
          className="whitespace-nowrap font-semibold text-primary underline-offset-4 hover:underline"
        >
          {ANNOUNCEMENT.cta}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this message"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

type HomeCard = { icon: LucideIcon; label: string; summary: string; href: string };

function SummaryCard({ icon: Icon, label, summary, href }: HomeCard) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      data-testid={`home-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-snug text-foreground">{summary}</p>
    </Link>
  );
}

export function DashboardSummaryCards({
  isShared,
  bankBalance,
  percentSpent,
  hasBudget,
  activeGoalCount,
  contributions,
}: {
  isShared: boolean;
  bankBalance: number | null;
  percentSpent: number;
  hasBudget: boolean;
  activeGoalCount: number;
  /** null on a personal budget. */
  contributions: { members: number; behind: number } | null;
}) {
  const cards: HomeCard[] = [];

  if (bankBalance != null) {
    cards.push({ icon: Landmark, label: "Bank", summary: `${formatKes(bankBalance)} available`, href: "/bank" });
  }

  cards.push({
    icon: PieChart,
    label: "This month",
    summary: hasBudget ? `${Math.round(percentSpent)}% of the budget used` : "No budget set yet",
    href: "/budget",
  });

  if (isShared) {
    cards.push({
      icon: Users,
      label: "Contributions",
      summary:
        contributions && contributions.members > 0
          ? contributions.behind > 0
            ? `${contributions.behind} behind this month`
            : "Everyone is up to date"
          : "See who has paid, share the report",
      href: "/contributions",
    });
  }

  cards.push({
    icon: Target,
    label: "Goals",
    summary: activeGoalCount > 0 ? `${activeGoalCount} active` : "No active goals",
    href: "/savings-goals",
  });

  if (isShared) {
    cards.push({ icon: FileText, label: "Reports", summary: "Monthly report and funding", href: "/reports" });
  }

  return (
    <section aria-label="Overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </section>
  );
}
