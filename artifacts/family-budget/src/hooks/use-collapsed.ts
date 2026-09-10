import { useCallback, useState } from "react";

/**
 * Whether a panel shows its full detail or just a summary line.
 *
 * The app leads with summaries — a screen full of figures is intimidating —
 * and remembers, per browser, which panels a person chose to open. Nothing is
 * removed; "See details" is always one click away.
 */
export function useCollapsed(storageKey: string, defaultOpen = false) {
  const key = `jamvi:collapse:${storageKey}`;

  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "open") return true;
      if (stored === "closed") return false;
    } catch {
      // Storage blocked — fall back to the default.
    }
    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(key, next ? "open" : "closed");
      } catch {
        // The choice still applies for this session.
      }
      return next;
    });
  }, [key]);

  return { open, toggle };
}
