import type { ReactNode } from "react";

/**
 * The few figures a page is about, ruled like the foot of a ledger rather than
 * floated as separate cards: the same treatment as the M-Pesa panel on Home.
 * Two columns on a phone, one row from sm up.
 */
export interface Figure {
  label: string;
  value: string;
  note?: ReactNode;
  tone?: "default" | "good" | "bad";
}

const TONE: Record<NonNullable<Figure["tone"]>, string> = {
  default: "text-foreground",
  good: "text-success",
  bad: "text-destructive",
};

export function FigureStrip({ figures, label, testId }: { figures: Figure[]; label: string; testId?: string }) {
  return (
    <section
      aria-label={label}
      data-testid={testId}
      className="grid grid-cols-2 overflow-hidden rounded-lg border-2 border-foreground bg-card shadow-[5px_5px_0_hsl(var(--jade))] sm:grid-flow-col sm:grid-cols-none sm:auto-cols-fr"
    >
      {figures.map((figure, i) => (
        <div
          key={figure.label}
          className={[
            "min-w-0 p-4",
            i % 2 === 1 ? "border-l border-border" : "",
            i >= 2 ? "border-t border-border sm:border-t-0" : "",
            i >= 1 ? "sm:border-l" : "",
          ].join(" ")}
        >
          <p className="kicker text-muted-foreground">{figure.label}</p>
          <p className={`mt-1.5 truncate font-mono text-lg font-semibold tabular-nums sm:text-xl ${TONE[figure.tone ?? "default"]}`}>
            {figure.value}
          </p>
          {figure.note ? <div className="mt-0.5 text-xs text-muted-foreground">{figure.note}</div> : null}
        </div>
      ))}
    </section>
  );
}
