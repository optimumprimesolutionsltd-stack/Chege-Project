import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { AmountCalcRow } from "@/components/amount-calc-row";
import { evaluateAmountExpression } from "@/lib/amount-expression";

/** What the text means as an amount: a number, or the sum it works out to. */
function resolve(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  if (/^\d+(?:\.\d{0,2})?$/.test(trimmed)) return Number(trimmed);
  const evaluated = evaluateAmountExpression(text);
  if (evaluated === null || !Number.isFinite(evaluated) || evaluated < 0) return null;
  return Math.round(evaluated * 100) / 100;
}

/**
 * An expense amount that takes arithmetic, with the phone's calculator keys.
 *
 * The forms this sits in read their amount as a plain number string in many
 * places, so the field keeps what was typed (500+250) to itself and hands the
 * form only the answer ("750"), or "" while the sum is unfinished. Nothing
 * downstream had to learn about expressions.
 */
export function AmountField({
  value,
  onChange,
  testId,
  className,
  placeholder,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  testId?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(value);

  // The form changed the amount behind our back (a saved draft, a reset for the
  // next entry): show that, unless it is only the answer to what is typed.
  useEffect(() => {
    const current = resolve(text);
    const shown = current === null ? "" : String(current);
    if (shown !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (next: string) => {
    setText(next);
    const answer = resolve(next);
    onChange(answer === null ? "" : String(answer));
  };

  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={placeholder ?? "e.g. 5000, or 1200+800"}
        value={text}
        onChange={(event) => handle(event.target.value)}
        required
        autoFocus={autoFocus}
        className={className}
        data-testid={testId}
      />
      <AmountCalcRow value={text} onChange={handle} testId={`${testId ?? "amount"}-calc`} />
    </div>
  );
}
