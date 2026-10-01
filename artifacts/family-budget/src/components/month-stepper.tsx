import { ChevronLeft, ChevronRight } from "lucide-react";
import { isoDay, MONTH_NAMES, stepMonth, wholeMonthOf } from "@/lib/month-range";

/**
 * < September 2026 > above a From/To pair, as on the phone: one click moves
 * the range a whole month. Dates typed in still work - the label then says
 * "Custom dates" and the arrows step from the month the range starts in. It
 * never steps past the current month.
 */
export function MonthStepper({
  from,
  to,
  onChange,
  testId = "month-stepper",
  className = "",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  testId?: string;
  className?: string;
}) {
  const today = isoDay(new Date());
  const whole = from ? wholeMonthOf(from, to, today) : null;
  const start = from || today;
  const canGoOn = start.slice(0, 7) < today.slice(0, 7);
  const go = (delta: number) => {
    const next = stepMonth(start, delta, today);
    onChange(next.from, next.to);
  };
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`} data-testid={testId}>
      <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="rounded-md p-1.5 hover:bg-muted" data-testid={`${testId}-prev`}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <span className="text-sm font-bold text-foreground" data-testid={`${testId}-label`}>
        {whole ? `${MONTH_NAMES[whole.month - 1]} ${whole.year}` : "Custom dates"}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={!canGoOn}
        aria-label="Next month"
        className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30"
        data-testid={`${testId}-next`}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
