import { CalendarRange } from "lucide-react";
import type { PeriodPreset } from "@/lib/bank-period";

const PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Pick dates" },
];

/** A date period for the bank page: quick ranges, or a from and to date. */
export function BankPeriodPicker({
  preset,
  onPreset,
  from,
  to,
  onFrom,
  onTo,
}: {
  preset: PeriodPreset;
  onPreset: (next: PeriodPreset) => void;
  from: string;
  to: string;
  onFrom: (next: string) => void;
  onTo: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="bank-period">
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      {PRESETS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onPreset(option.value)}
          aria-pressed={preset === option.value}
          data-testid={`bank-period-${option.value}`}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            preset === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-foreground hover:bg-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
      {preset === "custom" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => onFrom(event.target.value)}
            aria-label="From date"
            data-testid="bank-period-from"
            className="h-8 rounded-md border border-input bg-card px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => onTo(event.target.value)}
            aria-label="To date"
            data-testid="bank-period-to"
            className="h-8 rounded-md border border-input bg-card px-2 text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}
