import { useState } from "react";
import { Delete, Grid3x3 } from "lucide-react";
import { evaluateAmountExpression, isAmountExpression } from "@/lib/amount-expression";

const OPERATORS = ["+", "−", "×", "÷", "(", ")"] as const;
const DIGITS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "."] as const;

const KEY =
  "inline-flex h-8 min-w-9 flex-1 items-center justify-center rounded-md border border-input bg-muted px-2 text-sm font-semibold text-foreground hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The phone's calculator keys for an amount field: + − × ÷ ( ), delete, "="
 * to work the sum out, a number pad behind a toggle, and the live "= KES …"
 * line. A twin of the phone's AmountCalcRow, so a day of banking can be worked
 * the same way on either screen.
 */
export function AmountCalcRow({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  const [showPad, setShowPad] = useState(false);
  const isSum = isAmountExpression(value);
  const resolved = isSum ? evaluateAmountExpression(value) : null;

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowPad((current) => !current)}
          className={KEY}
          aria-label={showPad ? "Hide the number pad" : "Show the number pad"}
          aria-pressed={showPad}
          data-testid={`${testId}-toggle-keypad`}
        >
          <Grid3x3 className="h-4 w-4" />
        </button>
        {OPERATORS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value + key)}
            className={KEY}
            aria-label={`Insert ${key}`}
            data-testid={`${testId}-key-${key}`}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value.slice(0, -1))}
          className={KEY}
          aria-label="Delete the last character"
          data-testid={`${testId}-key-delete`}
        >
          <Delete className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled || resolved === null}
          onClick={() => {
            if (resolved !== null) onChange(String(resolved));
          }}
          className={`${KEY} border-primary text-primary`}
          aria-label="Work out the total"
          data-testid={`${testId}-key-equals`}
        >
          =
        </button>
      </div>
      {showPad ? (
        <div className="flex flex-wrap gap-1.5" data-testid={`${testId}-keypad`}>
          {DIGITS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(value + key)}
              className={`${KEY} basis-[22%]`}
              aria-label={`Insert ${key}`}
              data-testid={`${testId}-digit-${key}`}
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}
      {isSum ? (
        <p className="text-xs font-semibold text-primary" data-testid={`${testId}-resolved`}>
          {resolved === null ? "Not a sum I can read." : `= KES ${resolved.toLocaleString()}`}
        </p>
      ) : null}
    </div>
  );
}
