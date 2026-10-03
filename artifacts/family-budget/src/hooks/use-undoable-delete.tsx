import { useCallback, useEffect, useRef, useState } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { UNDO_DELETE_MS } from "@/lib/undo-delete";

type Pending = { key: string; run: () => Promise<void>; timer: ReturnType<typeof setTimeout> };

/**
 * "Deleted - Undo", for bank entries, expenses and budget categories - the
 * web twin of the phone's components/UndoDeleteBar. A delete is held back a
 * few seconds: the item leaves the list at once and a toast offers Undo; only
 * then does the delete reach the server, so Undo cancels it and nothing has to
 * be rebuilt. Leaving the page (or the tab going to the background) sends a
 * waiting delete at once rather than losing it.
 */
export function useUndoableDelete() {
  const { toast } = useToast();
  const pending = useRef<Pending[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const sync = () => setHidden(pending.current.map((entry) => entry.key));

  const send = useCallback((key: string) => {
    const item = pending.current.find((entry) => entry.key === key);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current = pending.current.filter((entry) => entry.key !== key);
    sync();
    void item.run();
  }, []);

  const undo = useCallback((key: string) => {
    const item = pending.current.find((entry) => entry.key === key);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current = pending.current.filter((entry) => entry.key !== key);
    sync();
  }, []);

  /** Hides the item now and deletes it in a few seconds, unless Undo is clicked. */
  const schedule = useCallback((key: string, label: string, run: () => Promise<void>) => {
    if (pending.current.some((entry) => entry.key === key)) return;
    const timer = setTimeout(() => send(key), UNDO_DELETE_MS);
    pending.current = [...pending.current, { key, run, timer }];
    sync();
    toast({
      title: `Deleted ${label}`,
      duration: UNDO_DELETE_MS,
      action: <ToastAction altText={`Undo deleting ${label}`} onClick={() => undo(key)} data-testid="undo-delete">Undo</ToastAction>,
    });
  }, [send, undo, toast]);

  useEffect(() => {
    const flush = () => { for (const entry of [...pending.current]) send(entry.key); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [send]);

  const isHidden = useCallback((key: string) => hidden.includes(key), [hidden]);
  return { schedule, undo, isHidden };
}
