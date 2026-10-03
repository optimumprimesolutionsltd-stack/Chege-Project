import { useCallback, useEffect, useRef, useState } from "react";

/**
 * An Undo for a screen's working state: each change to `value` can be taken
 * back, the most recent first, up to `limit` steps.
 *
 * Asked for 3 Oct 2026 - "undo buttons, in case someone pressed by mistake" -
 * first for the M-Pesa import (the phone's hooks/useUndoHistory.ts, the same), where one tap on the wrong chip changed a line
 * with no way back. Nothing here is saved: the history is the screen's own,
 * cleared when `resetKey` changes (a new list, or one just saved).
 */
export function useUndoHistory<T>(
  value: T,
  setValue: (next: T) => void,
  resetKey: unknown,
  options: { limit?: number; skip?: (previous: T) => boolean } = {},
) {
  const limit = options.limit ?? 30;
  const stack = useRef<T[]>([]);
  const last = useRef(value);
  const restoring = useRef(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (restoring.current) {
      restoring.current = false;
    } else if (last.current !== value && !(options.skip?.(last.current) ?? false)) {
      stack.current = withStep(stack.current, last.current, limit);
      setCount(stack.current.length);
    }
    last.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // After the effect above, so a new list's first state is not an undo step.
  useEffect(() => {
    stack.current = [];
    setCount(0);
    last.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const undo = useCallback(() => {
    const previous = stack.current.pop();
    if (previous === undefined) return;
    restoring.current = true;
    setCount(stack.current.length);
    setValue(previous);
  }, [setValue]);

  return { canUndo: count > 0, steps: count, undo };
}

/** The history with one more step, keeping only the newest `limit`. */
export function withStep<T>(stack: readonly T[], previous: T, limit: number): T[] {
  return [...stack.slice(-(limit - 1)), previous];
}
